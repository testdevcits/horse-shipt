const { sendEmail } = require("./sendEmail");
const { sendSMS } = require("./sendSMS");

/**
 * Notify Shipper after customer accepts quote
 * @param {Object} options
 *   - shipperEmail
 *   - shipperPhone
 *   - customerName
 *   - shipment
 *   - quote
 */
const notifyQuote = async ({
  shipperEmail,
  shipperPhone,
  customerName,
  shipment,
  quote,
}) => {
  try {
    // Use shipment mobile if available, else fallback to provided shipperPhone
    let phoneToUse = shipment.shipper?.mobile || shipperPhone;
    if (phoneToUse) phoneToUse = phoneToUse.replace(/\D/g, ""); // remove non-digit characters

    // ---------------- EMAIL ----------------
    if (shipperEmail) {
      const html = `
      <div style="font-family: Arial, sans-serif; padding:20px;">
        <div style="max-width:600px; margin:auto; background:#fff; border-radius:10px; overflow:hidden;">
          <div style="background:#BF9B53; color:#fff; padding:20px; text-align:center;">
            <h2>Quote Accepted</h2>
          </div>
          <div style="padding:20px;">
            <p>Hello, <strong>${
              shipment.shipper?.name || "Shipper"
            }</strong></p>
            <p>${customerName} has accepted your quote for the shipment <strong>${
        shipment.shipmentCode
      }</strong>.</p>

            <h3>Shipment Details</h3>
            <table style="width:100%; border-collapse:collapse;">
              <tr><td><strong>Pickup</strong></td><td>${
                shipment.pickupLocation || "N/A"
              }</td></tr>
              <tr><td><strong>Delivery</strong></td><td>${
                shipment.deliveryLocation || "N/A"
              }</td></tr>
              <tr><td><strong>Pickup Date</strong></td><td>${
                shipment.pickupDate
                  ? new Date(shipment.pickupDate).toLocaleDateString()
                  : "N/A"
              }</td></tr>
              <tr><td><strong>Delivery Date</strong></td><td>${
                shipment.deliveryDate
                  ? new Date(shipment.deliveryDate).toLocaleDateString()
                  : "N/A"
              }</td></tr>
              <tr><td><strong>Quote Amount</strong></td><td>${
                quote.totalPrice
              } ${quote.currency}</td></tr>
            </table>

            <p style="margin-top:20px;">Please check your dashboard for more details.</p>
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
      console.log("[INFO] Email sent to shipper:", shipperEmail);
    }

    // ---------------- SMS ----------------
    if (phoneToUse) {
      // Add +91 if 10-digit number
      if (/^\d{10}$/.test(phoneToUse)) {
        phoneToUse = `+91${phoneToUse}`;
      }

      const message = `Hi, ${customerName} accepted your quote for shipment ${shipment.shipmentCode}. Amount: ${quote.totalPrice} ${quote.currency}. Check dashboard for details.`;

      try {
        await sendSMS({ phone: phoneToUse, message });
        console.log("[INFO] SMS sent to shipper:", phoneToUse);
      } catch (smsError) {
        console.error("[ERROR] SMS failed but continuing:", smsError);
      }
    }

    console.log("[INFO] Shipper notified via email & SMS");
  } catch (err) {
    console.error("[ERROR] notifyQuote failed:", err.message);
  }
};

module.exports = { notifyQuote };
