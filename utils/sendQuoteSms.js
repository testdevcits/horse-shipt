// utils/sendQuoteSms.js
const twilio = require("twilio");
const Shipper = require("../models/shipper/shipperModel");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Format phone number to E.164 (+91XXXXXXXXXX)
 */
const formatPhone = (phone) => {
  if (!phone) return null;

  const cleaned = phone.replace(/\D/g, "");

  if (/^91\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  } else if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  } else {
    return null;
  }
};

/**
 * Send SMS to a shipper by ID
 */
const sendQuoteSms = async (shipperId, options = {}) => {
  try {
    // ✅ HANDLE WRONG INPUT (string passed instead of object)
    if (typeof options === "string") {
      options = { message: options };
    }

    const shipper = await Shipper.findById(shipperId);

    if (!shipper) {
      console.warn("[SMS] Shipper not found:", shipperId);
      return;
    }

    // ✅ Get phone
    const rawPhone = shipper.mobile || shipper.phone;

    if (!rawPhone) {
      console.warn(`[SMS] No phone for shipper: ${shipper._id}`);
      return;
    }

    // ✅ Format phone
    const phoneToUse = formatPhone(rawPhone);

    if (!phoneToUse) {
      console.warn("[SMS] Invalid phone format:", rawPhone);
      return;
    }

    console.log("[DEBUG] SMS phoneToUse:", phoneToUse);

    // ---------------- MESSAGE ----------------
    let message = options.message;

    // ✅ Auto build message if not provided
    if (!message && options.shipment && options.customer) {
      const customerName = options.customer.name || "Customer";
      const customerEmail = options.customer.email
        ? ` (${options.customer.email})`
        : "";

      message = `New quote received for shipment ${
        options.shipment.shipmentCode
      } from ${customerName}${customerEmail}. Amount: ${
        options.totalPrice || "N/A"
      } ${options.currency || ""}. Check dashboard.`;
    }

    // ✅ FINAL FALLBACK MESSAGE (important)
    if (!message) {
      message = "You have a new quote update. Please check your dashboard.";
      console.warn("[SMS] Using fallback message");
    }

    // ---------------- TWILIO CHECK ----------------
    if (!process.env.TWILIO_PHONE) {
      console.error("[SMS ERROR] TWILIO_PHONE missing in env");
      return;
    }

    // ---------------- SEND ----------------
    const sms = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE,
      to: phoneToUse,
    });

    console.log(`[SUCCESS] SMS sent to ${phoneToUse} (SID: ${sms.sid})`);
    return sms;
  } catch (err) {
    console.error("[ERROR] sendQuoteSms failed:", err.message);
    throw err;
  }
};

module.exports = { sendQuoteSms };
