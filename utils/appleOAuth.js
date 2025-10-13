const axios = require("axios");

/**
 * Verify Apple identity token and get user info
 * @param {string} idToken - The identity token received from Apple
 * @returns {Promise<object>} - Returns user info: { email, name }
 */
const verifyAppleToken = async (idToken) => {
  try {
    // Send token to Apple endpoint to verify
    const response = await axios.post(
      "https://appleid.apple.com/auth/token",
      {
        client_id: process.env.APPLE_CLIENT_ID,
        client_secret: process.env.APPLE_CLIENT_SECRET,
        code: idToken,
        grant_type: "authorization_code",
      },
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const data = response.data;

    // The returned data includes id_token which is a JWT
    // You can decode it to get email and other info
    const jwt = data.id_token;
    const base64Payload = jwt.split(".")[1];
    const payloadBuffer = Buffer.from(base64Payload, "base64");
    const payload = JSON.parse(payloadBuffer.toString("utf-8"));

    return {
      email: payload.email,
      name: payload.name || payload.email.split("@")[0],
      appleId: payload.sub,
    };
  } catch (err) {
    console.error("Apple OAuth verification error:", err);
    throw new Error("Apple OAuth verification failed");
  }
};

module.exports = verifyAppleToken;
