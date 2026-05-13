const Invitation = require("../../models/common/ShipmentInvitation");
const Shipment = require("../../models/customer/CustomerShipment");
const Customer = require("../../models/customer/customerModel");
const Shipper = require("../../models/shipper/shipperModel");
const sendEmail = require("../../utils/sendShipmentInviteEmail");
const { emitToUser } = require("../../sockets/realtimeSocket");

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatDate = (dateValue) => {
  if (!dateValue) return "N/A";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatDateRange = (range, fallbackDate) => {
  const start = range?.start || fallbackDate;
  const end = range?.end || fallbackDate;

  if (!start && !end) return "N/A";

  const startText = formatDate(start);
  const endText = formatDate(end);

  if (startText === "N/A") return endText;
  if (endText === "N/A" || startText === endText) return startText;
  return `${startText} - ${endText}`;
};

exports.sendInvitation = async (req, res) => {
  try {
    const { shipmentId, shipperId, message = "" } = req.body;

    if (!shipmentId || !shipperId) {
      return res.status(400).json({
        success: false,
        message: "shipmentId and shipperId required",
      });
    }

    const [shipment, shipper, customer] = await Promise.all([
      Shipment.findById(shipmentId).lean(),
      Shipper.findById(shipperId).select("name email").lean(),
      Customer.findById(req.user.id).select("name email uniqueId").lean(),
    ]);

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    if (shipment.customer?.toString() !== req.user.id?.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only request quotes for your own shipment.",
      });
    }

    if (!shipment.publish) {
      return res.status(400).json({
        success: false,
        message:
          "Please publish this shipment before requesting quotes. Draft shipments are not visible to shippers.",
      });
    }

    if (!["open_for_offers", "pending"].includes(shipment.status)) {
      return res.status(400).json({
        success: false,
        message:
          "Invitations can only be sent while the shipment is open for offers.",
      });
    }

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    // prevent duplicate
    const existing = await Invitation.findOne({
      shipment: shipmentId,
      shipper: shipperId,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Quote already requested",
      });
    }

    const invitation = await Invitation.create({
      shipment: shipmentId,
      customer: req.user.id,
      shipper: shipperId,

      // snapshot
      shipmentCode: shipment.shipmentCode,
      pickupLocation: shipment.pickupLocation,
      deliveryLocation: shipment.deliveryLocation,
      message,
    });

    let emailSent = false;

    if (shipper.email) {
      const dashboardUrl = `${
        process.env.FRONTEND_URL || process.env.REACT_APP_FRONTEND_URL || ""
      }/shipper/dashboard`;

      const shipperName = escapeHtml(shipper.name || "Shipper");
      const customerLabel = escapeHtml(customer?.uniqueId || customer?.name || "A customer");
      const shipmentCode = escapeHtml(shipment.shipmentCode || "N/A");
      const pickupLocation = escapeHtml(shipment.pickupLocation || "N/A");
      const deliveryLocation = escapeHtml(shipment.deliveryLocation || "N/A");
      const pickupDate = escapeHtml(
        formatDateRange(shipment.pickupDateRange, shipment.pickupDate)
      );
      const deliveryDate = escapeHtml(
        formatDateRange(shipment.deliveryDateRange, shipment.deliveryDate)
      );
      const safeMessage = escapeHtml(message);

      emailSent = await sendEmail({
        to: shipper.email,
        subject: `New quote request: ${shipment.shipmentCode}`,
        html: `
          <div style="font-family:Arial,sans-serif;background:#f9fafb;padding:24px;">
            <div style="max-width:620px;margin:auto;background:#fff;border:1px solid #eee;border-radius:10px;overflow:hidden;">
              <div style="background:#BF9B53;color:#fff;padding:18px 22px;">
                <h2 style="margin:0;">Horse Shipt</h2>
              </div>
              <div style="padding:22px;color:#333;">
                <p>Hello <strong>${shipperName}</strong>,</p>
                <p><strong>New Opportunity!</strong> Customer ${customerLabel} has requested a quote for this shipment.</p>
                <h3 style="margin:20px 0 10px;color:#222;">Shipment Details</h3>
                <table style="width:100%;border-collapse:collapse;background:#f8f8f8;border-left:4px solid #BF9B53;margin:18px 0;">
                  <tr>
                    <td style="padding:10px 12px;border-bottom:1px solid #eee;"><strong>Shipment Code</strong></td>
                    <td style="padding:10px 12px;border-bottom:1px solid #eee;">${shipmentCode}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;border-bottom:1px solid #eee;"><strong>Pickup</strong></td>
                    <td style="padding:10px 12px;border-bottom:1px solid #eee;">${pickupLocation}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;border-bottom:1px solid #eee;"><strong>Delivery</strong></td>
                    <td style="padding:10px 12px;border-bottom:1px solid #eee;">${deliveryLocation}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;border-bottom:1px solid #eee;"><strong>Pickup Date</strong></td>
                    <td style="padding:10px 12px;border-bottom:1px solid #eee;">${pickupDate}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;"><strong>Delivery Date</strong></td>
                    <td style="padding:10px 12px;">${deliveryDate}</td>
                  </tr>
                </table>
                ${
                  message
                    ? `<p style="font-size:14px;color:#555;"><strong>Message:</strong> ${safeMessage}</p>`
                    : ""
                }
                <p style="margin:22px 0;">
                  <a href="${dashboardUrl}" style="background:#BF9B53;color:#fff;padding:11px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View quote request</a>
                </p>
                <p>Please login to your HorseShipt account for details and to send a quote.</p>
                <p>Thanks,<br/><strong>Horse Shipt Team</strong></p>
              </div>
            </div>
          </div>
        `,
      });
    }

    const io = req.app.get("io");
    emitToUser(io, {
      role: "shipper",
      userId: shipperId,
      event: "horse_shipt:shipment_invitation_created",
      payload: {
          ...invitation.toObject(),
          shipment: {
            _id: shipment._id,
            shipmentCode: shipment.shipmentCode,
            status: shipment.status,
            pickupLocation: shipment.pickupLocation,
            deliveryLocation: shipment.deliveryLocation,
            pickupDateRange: shipment.pickupDateRange,
            deliveryDateRange: shipment.deliveryDateRange,
            horses: shipment.horses || [],
            numberOfHorses: shipment.numberOfHorses,
            estimatedDistance: shipment.estimatedDistance,
            transportType: shipment.transportType,
          },
          customer: customer
            ? {
                _id: customer._id,
                name: customer.name,
                email: customer.email,
                uniqueId: customer.uniqueId,
              }
            : req.user.id,
      },
      notification: {
        type: "shipment_invitation",
        title: "New Opportunity!",
        message: `Customer ${
          customer?.uniqueId || customer?.name || ""
        } has requested a quote for shipment ${
          shipment.shipmentCode || ""
        }. Please login to your HorseShipt account for details and to send a quote.`,
      },
    });

    return res.json({
      success: true,
      message: emailSent
        ? "Quote request sent and email delivered"
        : "Quote request sent",
      data: invitation,
      emailSent,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Quote request already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
