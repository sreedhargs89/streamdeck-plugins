// Microsoft sign-in for a public client: auth-code + PKCE via the browser (loopback redirect),
// refresh token kept in the macOS Keychain. Works with Conditional Access because the browser
// on this Mac does the sign-in, not a device-code prompt.
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const SCOPES = "Calendars.Read User.Read offline_access";
const KEYCHAIN_SERVICE = "streamdeck-m365";
const KEYCHAIN_ACCOUNT = "refresh_token";
export const CONFIG_PATH = join(homedir(), ".config/streamdeck-m365.json");

/** { tenant, clientId } written by `npm run login -- --tenant .. --client ..` */
export function loadConfig(path = CONFIG_PATH) {
  if (!existsSync(path)) return null;
  try {
    const c = JSON.parse(readFileSync(path, "utf8"));
    return c.tenant && c.clientId ? c : null;
  } catch {
    return null;
  }
}

export function saveConfig(cfg, path = CONFIG_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2));
}

function sh(bin, args) {
  return new Promise((resolve, reject) =>
    execFile(bin, args, (err, stdout, stderr) => (err ? reject(new Error(stderr?.trim() || err.message)) : resolve(stdout.trim())))
  );
}

export const keychain = {
  get: () => sh("/usr/bin/security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"]).catch(() => null),
  set: (v) => sh("/usr/bin/security", ["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w", v]),
  clear: () => sh("/usr/bin/security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT]).catch(() => null),
};

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function pkce() {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

async function tokenRequest(cfg, form) {
  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, scope: SCOPES, ...form }),
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body.error_description?.split("\r\n")[0] || body.error || `token HTTP ${res.status}`);
    err.code = body.error;
    throw err;
  }
  return body;
}

/** Holds the access token in memory and refreshes it from the Keychain refresh token. */
export class Session {
  constructor(cfg) {
    this.cfg = cfg;
    this.access = null;
    this.expires = 0;
  }
  async token() {
    if (this.access && Date.now() < this.expires - 60_000) return this.access;
    const refresh = await keychain.get();
    if (!refresh) throw Object.assign(new Error("not signed in"), { code: "signed_out" });
    let t;
    try {
      t = await tokenRequest(this.cfg, { grant_type: "refresh_token", refresh_token: refresh });
    } catch (e) {
      if (e.code === "invalid_grant") throw Object.assign(new Error("sign-in expired"), { code: "signed_out" });
      throw e;
    }
    if (t.refresh_token) await keychain.set(t.refresh_token);
    this.access = t.access_token;
    this.expires = Date.now() + t.expires_in * 1000;
    return this.access;
  }
  forget() {
    this.access = null;
    this.expires = 0;
  }
}

/**
 * Opens the browser for sign-in and waits for the loopback redirect.
 * Resolves once the refresh token is stored in the Keychain.
 */
export function interactiveLogin(cfg, { open = (url) => sh("/usr/bin/open", [url]), timeoutMs = 5 * 60_000 } = {}) {
  const { verifier, challenge } = pkce();
  const stateParam = b64url(randomBytes(12));
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      if (!url.searchParams.has("code") && !url.searchParams.has("error")) {
        res.writeHead(404).end();
        return;
      }
      const done = (ok, msg) => {
        res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<html><body style="font:16px -apple-system;padding:40px"><h2>${ok ? "✅ Signed in" : "❌ Sign-in failed"}</h2><p>${msg}</p></body></html>`);
        server.close();
      };
      try {
        if (url.searchParams.get("state") !== stateParam) throw new Error("state mismatch");
        if (url.searchParams.has("error")) throw new Error(url.searchParams.get("error_description") || url.searchParams.get("error"));
        const t = await tokenRequest(cfg, {
          grant_type: "authorization_code",
          code: url.searchParams.get("code"),
          redirect_uri: redirectUri,
          code_verifier: verifier,
        });
        await keychain.set(t.refresh_token);
        done(true, "Stream Deck Next Meeting can read your calendar now. You can close this tab.");
        resolve();
      } catch (e) {
        done(false, String(e.message).replace(/</g, "&lt;"));
        reject(e);
      }
    });
    let redirectUri;
    server.listen(0, "127.0.0.1", () => {
      redirectUri = `http://localhost:${server.address().port}`;
      const auth = new URL(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/authorize`);
      auth.search = new URLSearchParams({
        client_id: cfg.clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        response_mode: "query",
        scope: SCOPES,
        state: stateParam,
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt: "select_account",
      }).toString();
      open(auth.toString()).catch(reject);
    });
    setTimeout(() => {
      server.close();
      reject(new Error("sign-in timed out"));
    }, timeoutMs).unref();
  });
}
