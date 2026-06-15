// utils/notifyQuote/notifyQuote.js
const { sendEmail } = require("./sendEmail");
const { sendSMS } = require("./sendSMS");

/**
 * Format phone to E.164 (+91XXXXXXXXXX)
 */
const formatPhone = (phone) => {
  if (!phone) return null;

  const cleaned = phone.replace(/\D/g, "");

  if (/^91\d{10}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;

  return null;
};

/**
 * Notify Shipper after customer accepts quote
 */
const notifyQuote = async ({
  shipperEmail,
  shipperPhone,
  customerName,
  shipment,
  quote,
}) => {
  try {
    const phoneToUse = formatPhone(shipperPhone);

    // ---------------- EMAIL ----------------
    if (shipperEmail) {
      try {
        const html = `
        <div style="font-family: Arial, sans-serif; padding:20px;">
          <div style="max-width:600px; margin:auto; background:#fff; border-radius:10px;">
            <div style="background:#BF9B53; color:#fff; padding:20px; text-align:center;">
              <h2>Quote Accepted</h2>
            </div>

            <div style="padding:20px;">
              <p>Hello, <strong>${
                shipment.shipper?.name || "Shipper"
              }</strong></p>
              <p>${customerName} accepted your quote for <strong>${
          shipment.shipmentCode
        }</strong>.</p>

              <p><strong>Amount:</strong> ${quote.totalPrice} ${
          quote.currency
        }</p>
              <p>Please check your dashboard.</p>
            </div>

            <div style="background:#f1f1f1; text-align:center; padding:10px; font-size:12px;">
              © ${new Date().getFullYear()} Horsehipt
            </div>
          </div>
        </div>
        `;

        await sendEmail({
          to: shipperEmail,
          subject: `Quote Accepted by ${customerName}`,
          html,
        });
      } catch (emailError) {
        console.error("[ERROR] Email failed:", emailError.message);
      }
    }

    // ---------------- SMS ----------------
    if (phoneToUse) {
      try {
        const message = `Hi ${customerName}, your quote for ${shipment.shipmentCode} is accepted. Amount: ${quote.totalPrice} ${quote.currency}. View here: https://horse-shipt-frontend.vercel.app/shipper/shipments`;

        await sendSMS({ phone: phoneToUse, message });
      } catch (smsError) {
        console.error("[ERROR] SMS failed:", smsError.message);
      }
    } else {
      console.warn("[WARN] Invalid or missing phone, SMS skipped");
    }
  } catch (err) {
    console.error("[ERROR] notifyQuote failed:", err.message);
  }
};

module.exports = { notifyQuote };
