// utils/sendQuoteSms.js
const twilio = require("twilio");
const Shipper = require("../models/shipper/shipperModel");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Format phone number to E.164 (+91XXXXXXXXXX)
 */
const formatPhone = (phone) => {
  if (!phone) return null;

  let cleaned = phone.replace(/\D/g, "");

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
    const shipper = await Shipper.findById(shipperId);

    if (!shipper) {
      console.warn("[SMS] Shipper not found:", shipperId);
      return;
    }

    // ✅ Use consistent field (mobile preferred, fallback to phone)
    const rawPhone = shipper.mobile || shipper.phone;

    if (!rawPhone) {
      console.warn(`[SMS] No phone number for shipper: ${shipper._id}`);
      return;
    }

    // ✅ Format properly
    const phoneToUse = formatPhone(rawPhone);

    if (!phoneToUse) {
      console.warn("[SMS] Invalid phone format:", rawPhone);
      return;
    }

    console.log("[DEBUG] SMS phoneToUse:", phoneToUse);

    // ---------------- MESSAGE ----------------
    let message = options.message;

    if (!message && options.shipment && options.customer) {
      const customerName = options.customer.name || "Customer";
      const customerEmail = options.customer.email
        ? ` (${options.customer.email})`
        : "";

      message = `New quote received for shipment ${options.shipment.shipmentCode} from ${customerName}${customerEmail}. Amount: ${options.totalPrice} ${options.currency}. Check your dashboard for details.`;
    }

    if (!message) {
      console.warn("[SMS] No message content provided");
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
    throw err; // important for debugging
  }
};

module.exports = { sendQuoteSms };
