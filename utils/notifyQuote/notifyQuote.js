// utils/notifyQuote/notifyQuote.js
const { sendEmail } = require("./sendEmail");
const { sendSMS } = require("./sendSMS");
const { buildFrontendUrl } = require("../frontendUrl");
const {
  baseTemplate,
  detailTable,
  escapeHtml,
} = require("../mailTemplates/baseTemplate");

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
        const html = baseTemplate({
          title: "Quote Accepted",
          preheader: `${customerName} accepted your quote for ${shipment.shipmentCode}.`,
          buttonText: "View Dashboard",
          buttonUrl: buildFrontendUrl("/shipper/shipments"),
          body: `
            <p style="margin:0 0 10px;">Hello <strong>${escapeHtml(
              shipment.shipper?.name || "Shipper"
            )}</strong>,</p>
            <p style="margin:0;">${escapeHtml(customerName)} accepted your quote.</p>
            ${detailTable([
              {
                label: "Shipment Code",
                value: escapeHtml(shipment.shipmentCode || "N/A"),
              },
              {
                label: "Amount",
                value: `${escapeHtml(quote.totalPrice || 0)} ${escapeHtml(
                  quote.currency || "USD"
                )}`,
              },
            ])}
          `,
          note: "Please check your dashboard for next steps.",
        });

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
        const message = `Hi ${customerName}, your quote for ${shipment.shipmentCode} is accepted. Amount: ${quote.totalPrice} ${quote.currency}. View here: ${buildFrontendUrl("/shipper/shipments")}`;

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
