/* =========================================================
KRISHWAVE AI BEAST V7.2
DERIV OAUTH BACKEND
RAILWAY SERVER

FEATURES:
- Deriv OAuth 2.0 + PKCE Exchange
- Secure server-side token storage
- Account retrieval endpoint
- Authenticated WebSocket OTP generator
- Express CORS middleware configured for GitHub Pages
- Auto-cleaning session management
========================================================= */

const express = require("express");
const crypto = require("crypto");

const app = express();

/* =========================================================
CONFIGURATION
========================================================= */

const PORT = process.env.PORT || 8080;

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID ||
  "34khasPjsT0PCRR8X3Z70";

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
Maximum lifetime of internal session (55 minutes).
The Deriv access token itself is NEVER sent directly to the browser.
*/
const SESSION_TTL = 55 * 60 * 1000;

/* =========================================================
EXPRESS MIDDLEWARE
========================================================= */

app.use(express.json({ limit: "100kb" }));

/* =========================================================
CORS CONFIGURATION
========================================================= */

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

/* =========================================================
INTERNAL SESSION STORE
========================================================= */

const sessions = new Map();

/* =========================================================
SESSION HELPER FUNCTIONS
========================================================= */

function createSession(accessToken, expiresIn) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const requestedLifetime = Number(expiresIn || 3600) * 1000;
  const lifetime = Math.min(requestedLifetime, SESSION_TTL);
  const expiresAt = Date.now() + lifetime;

  sessions.set(sessionId, {
    accessToken,
    expiresAt
  });

  return {
    sessionId,
    expiresAt
  };
}

function getSession(sessionId) {
  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  if (Date.now() >= session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

/* Clear expired sessions every 5 minutes */
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now >= session.expiresAt) {
      sessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

/* =========================================================
SAFE JSON PARSER
========================================================= */

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/* =========================================================
SYSTEM ENDPOINTS
========================================================= */

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "KRISHWAVE OAuth Backend",
    version: "7.2.0",
    status: "online",
    backend: "railway",
    frontend: FRONTEND_ORIGIN,
    oauth: true
  });
});

app.get("/api/config", (req, res) => {
  res.json({
    success: true,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    frontend_origin: FRONTEND_ORIGIN,
    backend: "railway",
    status: "online"
  });
});

app.get("/api/oauth/info", (req, res) => {
  res.json({
    success: true,
    authorization_url: DERIV_AUTH_URL,
    token_url: DERIV_TOKEN_URL,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    pkce: true
  });
});

/* =========================================================
OAUTH EXCHANGE
========================================================= */

app.post("/api/oauth/exchange", async (req, res) => {
  try {
    const { code, code_verifier } = req.body || {};

    if (!code) {
      return res.status(400).json({
        success: false,
        error: "Missing authorization code"
      });
    }

    if (!code_verifier) {
      return res.status(400).json({
        success: false,
        error: "Missing PKCE code verifier"
      });
    }

    const params = new URLSearchParams();
    params.set("grant_type", "authorization_code");
    params.set("client_id", CLIENT_ID);
    params.set("code", code);
    params.set("code_verifier", code_verifier);
    params.set("redirect_uri", REDIRECT_URI);

    const response = await fetch(DERIV_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: params.toString()
    });

    const data = await readJsonResponse(response);

    if (!response.ok) {
      console.error("Deriv OAuth exchange error:", response.status, data);
      return res.status(response.status).json({
        success: false,
        error:
          data.error_description ||
          data.error?.message ||
          data.error ||
          "Deriv OAuth exchange failed"
      });
    }

    if (!data.access_token) {
      console.error("Deriv returned no access token:", data);
      return res.status(500).json({
        success: false,
        error: "Deriv did not return an access token"
      });
    }

    const session = createSession(data.access_token, data.expires_in);

    return res.json({
      success: true,
      session_id: session.sessionId,
      expires_in: Math.floor((session.expiresAt - Date.now()) / 1000)
    });
  } catch (error) {
    console.error("OAuth exchange error:", error);
    return res.status(500).json({
      success: false,
      error: "KRISHWAVE OAuth backend error"
    });
  }
});

/* =========================================================
GET ACCOUNTS
========================================================= */

app.post("/api/accounts", async (req, res) => {
  try {
    const { session_id } = req.body || {};
    const session = getSession(session_id);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: "Session expired or invalid"
      });
    }

    const response = await fetch(`${DERIV_API}/accounts`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json"
      }
    });

    const data = await readJsonResponse(response);

    if (!response.ok) {
      console.error("Deriv accounts error:", response.status, data);
      return res.status(response.status).json({
        success: false,
        error:
          data.error?.message ||
          data.error_description ||
          data.error ||
          "Unable to get Deriv accounts"
      });
    }

    const accounts = data.accounts || data.data || data;

    return res.json({
      success: true,
      accounts
    });
  } catch (error) {
    console.error("Accounts error:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to retrieve Deriv accounts"
    });
  }
});

/* =========================================================
CREATE WEBSOCKET OTP
========================================================= */

app.post("/api/otp", async (req, res) => {
  try {
    const { session_id, account_id } = req.body || {};
    const session = getSession(session_id);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: "Session expired or invalid"
      });
    }

    if (!account_id) {
      return res.status(400).json({
        success: false,
        error: "Missing account ID"
      });
    }

    const endpoint = `${DERIV_API}/accounts/${encodeURIComponent(account_id)}/otp`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json"
      }
    });

    const data = await readJsonResponse(response);

    if (!response.ok) {
      console.error("Deriv OTP error:", response.status, data);
      return res.status(response.status).json({
        success: false,
        error:
          data.error?.message ||
          data.error_description ||
          data.error ||
          "Unable to create Deriv WebSocket"
      });
    }

    const websocketUrl = data.websocket_url || data.url || data.ws_url;

    if (!websocketUrl) {
      console.error("No WebSocket URL returned:", data);
      return res.status(500).json({
        success: false,
        error: "Deriv did not return a WebSocket URL"
      });
    }

    return res.json({
      success: true,
      websocket_url: websocketUrl,
      expires_in: 120
    });
  } catch (error) {
    console.error("OTP error:", error);
    return res.status(500).json({
      success: false,
      error: "KRISHWAVE WebSocket authentication error"
    });
  }
});

/* =========================================================
LOGOUT & SESSION CHECK
========================================================= */

app.post("/api/logout", (req, res) => {
  try {
    const { session_id } = req.body || {};
    if (session_id) {
      sessions.delete(session_id);
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      success: false,
      error: "Logout failed"
    });
  }
});

app.post("/api/session", (req, res) => {
  const { session_id } = req.body || {};
  const session = getSession(session_id);

  if (!session) {
    return res.status(401).json({
      success: false,
      valid: false,
      error: "Session expired or invalid"
    });
  }

  return res.json({
    success: true,
    valid: true,
    expires_at: session.expiresAt
  });
});

/* =========================================================
ERROR & NOT FOUND HANDLERS
========================================================= */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "KRISHWAVE API route not found",
    path: req.path
  });
});

app.use((error, req, res, next) => {
  console.error("KRISHWAVE server error:", error);
  res.status(500).json({
    success: false,
    error: "KRISHWAVE server error"
  });
});

/* =========================================================
START SERVER
========================================================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================================");
  console.log("KRISHWAVE AI BEAST V7.2");
  console.log("Railway backend is ONLINE");
  console.log(`Port: ${PORT}`);
  console.log(`Client ID: ${CLIENT_ID}`);
  console.log(`Redirect URI: ${REDIRECT_URI}`);
  console.log(`Frontend: ${FRONTEND_ORIGIN}`);
  console.log("OAuth: ENABLED");
  console.log("=================================================");
});
