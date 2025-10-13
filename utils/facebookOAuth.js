// utils/facebookOAuth.js
const axios = require("axios");

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;

/**
 * Verify Facebook access token and get user profile
 * @param {string} accessToken - User access token from frontend
 * @returns {Promise<Object>} profile - { id, name, email }
 */
async function verifyFacebookToken(accessToken) {
  try {
    if (!accessToken) throw new Error("Access token is required");

    // Step 1: Verify token
    const debugUrl = `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`;
    const debugRes = await axios.get(debugUrl);

    if (!debugRes.data || !debugRes.data.data || !debugRes.data.data.is_valid) {
      throw new Error("Invalid Facebook token");
    }

    const userId = debugRes.data.data.user_id;

    // Step 2: Get user profile
    const profileUrl = `https://graph.facebook.com/${userId}?fields=id,name,email&access_token=${accessToken}`;
    const profileRes = await axios.get(profileUrl);

    return profileRes.data; // { id, name, email }
  } catch (err) {
    console.error("Facebook OAuth error:", err.message);
    throw new Error("Facebook authentication failed");
  }
}

module.exports = verifyFacebookToken;
