const axios = require("axios");

/**
 * Verify Apple identity token and get user info
 * @param {string} idToken
 * @returns {Promise<object>} - { email, name, appleId }
 */
const verifyAppleToken = async (idToken) => {
  try {
    const params = new URLSearchParams();
    params.append("client_id", process.env.APPLE_CLIENT_ID);
    params.append("client_secret", process.env.APPLE_CLIENT_SECRET);
    params.append("code", idToken);
    params.append("grant_type", "authorization_code");

    const response = await axios.post(
      "https://appleid.apple.com/auth/token",
      params,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const jwtToken = response.data.id_token;
    const payload = JSON.parse(
      Buffer.from(jwtToken.split(".")[1], "base64").toString("utf-8")
    );

    return {
      email: payload.email,
      name: payload.name || payload.email.split("@")[0],
      appleId: payload.sub,
    };
  } catch (err) {
    console.error("Apple OAuth verification error:", err.message);
    throw new Error("Apple OAuth verification failed");
  }
};

module.exports = verifyAppleToken;
