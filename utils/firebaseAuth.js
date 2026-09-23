const axios = require("axios");
const jwt = require("jsonwebtoken");

let cachedCerts = null;
let cachedCertsExpiresAt = 0;

const getFirebaseProjectId = () =>
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT;

const getFirebaseCerts = async ({ forceRefresh = false } = {}) => {
  const now = Date.now();
  if (!forceRefresh && cachedCerts && cachedCertsExpiresAt > now) {
    return cachedCerts;
  }

  const { data, headers } = await axios.get(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
  );

  const cacheControl = headers["cache-control"] || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 60 * 60 * 1000;

  cachedCerts = data;
  cachedCertsExpiresAt = now + maxAgeMs;
  return cachedCerts;
};

const verifyFirebaseIdToken = async (idToken) => {
  const projectId = getFirebaseProjectId();
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is not configured");
  }

  const decodedHeader = jwt.decode(idToken, { complete: true });
  const decodedPayload = jwt.decode(idToken);
  const kid = decodedHeader?.header?.kid;
  if (!kid) {
    throw new Error("Invalid Firebase token");
  }

  if (decodedPayload?.iss && decodedPayload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error(
      "Invalid token issuer. Send Firebase Auth ID token, not Google Sign-In ID token"
    );
  }

  let certs = await getFirebaseCerts();
  let cert = certs[kid];
  if (!cert) {
    certs = await getFirebaseCerts({ forceRefresh: true });
    cert = certs[kid];
  }

  if (!cert) {
    throw new Error(
      "Invalid Firebase token certificate. Send Firebase Auth ID token from FirebaseAuth currentUser"
    );
  }

  const decoded = jwt.verify(idToken, cert, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });

  if (!decoded.sub || decoded.sub !== decoded.user_id) {
    throw new Error("Invalid Firebase token subject");
  }

  return decoded;
};

module.exports = { verifyFirebaseIdToken };
