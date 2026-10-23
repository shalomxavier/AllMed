const admin = require('firebase-admin');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

/**
 * Shared admin initialization for one-off maintenance scripts.
 *
 * Credentials resolution order:
 *   1. GOOGLE_APPLICATION_CREDENTIALS (service account / ADC file), when set.
 *   2. The firebase CLI's stored refresh token, materialized as an
 *      authorized_user ADC file in the OS temp dir (mode 0600). The OAuth
 *      client id/secret are read from the installed firebase-tools package
 *      (envOverride defaults in lib/api.js) — nothing is embedded here.
 */

function resolveProjectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try {
    const rc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '.firebaserc'), 'utf8'));
    return rc.projects && rc.projects.default;
  } catch {
    return undefined;
  }
}

function cliOAuthClient() {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  const apiJs = fs.readFileSync(path.join(root, 'firebase-tools', 'lib', 'api.js'), 'utf8');
  const pick = (name) => {
    const match = apiJs.match(new RegExp(`envOverride\\("${name}",\\s*"([^"]+)"\\)`));
    return match && match[1];
  };
  const clientId = process.env.FIREBASE_CLIENT_ID || pick('FIREBASE_CLIENT_ID');
  const clientSecret = process.env.FIREBASE_CLIENT_SECRET || pick('FIREBASE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('Could not resolve firebase CLI OAuth client values from the installed firebase-tools package.');
  }
  return { clientId, clientSecret };
}

function initAdmin(adcFileName = 'maintenance-adc.json') {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const refreshToken = config.tokens && config.tokens.refresh_token;
    if (!refreshToken) {
      throw new Error('No credentials: set GOOGLE_APPLICATION_CREDENTIALS or run firebase login.');
    }
    const { clientId, clientSecret } = cliOAuthClient();
    const adcPath = path.join(os.tmpdir(), adcFileName);
    fs.writeFileSync(adcPath, JSON.stringify({
      type: 'authorized_user',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }), { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath;
  }
  admin.initializeApp({ projectId: resolveProjectId() });
  return admin;
}

module.exports = { initAdmin, resolveProjectId };
