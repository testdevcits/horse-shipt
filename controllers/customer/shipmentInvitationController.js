const { apiResponse } = require("../../responses/api.response");
const Invitation = require("../../models/common/ShipmentInvitation");
const Shipment = require("../../models/customer/CustomerShipment");
const Customer = require("../../models/customer/customerModel");
const Shipper = require("../../models/shipper/shipperModel");
const sendEmail = require("../../utils/sendShipmentInviteEmail");
const { emitToUser } = require("../../sockets/realtimeSocket");
const { buildFrontendUrl } = require("../../utils/frontendUrl");
const {
  baseTemplate,
  detailTable,
} = require("../../utils/mailTemplates/baseTemplate");
const {
  getShipperChannelSettings,
} = require("../../utils/notificationPreferences");

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
        message: apiResponse.SHIPMENTID_AND_SHIPPERID_REQUIRED,
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
        message: apiResponse.SHIPMENT_NOT_FOUND,
      });
    }

    if (shipment.customer?.toString() !== req.user.id?.toString()) {
      return res.status(403).json({
        success: false,
        message: apiResponse.YOU_CAN_ONLY_REQUEST_QUOTES_FOR_YOUR_OWN_SHIPMENT,
      });
    }

    if (!shipment.publish) {
      return res.status(400).json({
        success: false,
        message:
          apiResponse.PLEASE_PUBLISH_THIS_SHIPMENT_BEFORE_REQUESTING_QUOTES_DRAFT_SHIPMENTS_AR,
      });
    }

    if (!["open_for_offers", "pending"].includes(shipment.status)) {
      return res.status(400).json({
        success: false,
        message:
          apiResponse.INVITATIONS_CAN_ONLY_BE_SENT_WHILE_THE_SHIPMENT_IS_OPEN_FOR_OFFERS,
      });
    }

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPPER_NOT_FOUND,
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
        message: apiResponse.QUOTE_ALREADY_REQUESTED,
      });
    }

    const invitation = await Invitation.create({
      shipment: shipmentId,
      customer: req.user.id,
      shipper: shipperId,

      // snapshot
      shipmentCode: shipment.shipmentCode,
      pickupLocation: shipment.pickupLocation,
      pickupCoords: shipment.pickupCoords,
      deliveryLocation: shipment.deliveryLocation,
      deliveryCoords: shipment.deliveryCoords,
      message,
    });

    let emailSent = false;

    const opportunitySettings = await getShipperChannelSettings(
      shipperId,
      "opportunity"
    );

    if (shipper.email && opportunitySettings.email) {
      const dashboardUrl = buildFrontendUrl("/shipper/dashboard");

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
        html: baseTemplate({
          title: "New Quote Request",
          preheader: `Customer ${customerLabel} requested a quote for shipment ${shipmentCode}.`,
          buttonText: "View Quote Request",
          buttonUrl: dashboardUrl,
          body: `
            <p style="margin:0 0 10px;">Hello <strong>${shipperName}</strong>,</p>
            <p style="margin:0;">Customer ${customerLabel} has requested a quote for this shipment.</p>
            ${detailTable([
              { label: "Shipment Code", value: shipmentCode },
              { label: "Pickup", value: pickupLocation },
              { label: "Delivery", value: deliveryLocation },
              { label: "Pickup Date", value: pickupDate },
              { label: "Delivery Date", value: deliveryDate },
            ])}
            ${
              message
                ? `<p style="margin:0;font-size:14px;color:#555;"><strong>Message:</strong> ${safeMessage}</p>`
                : ""
            }
          `,
          note: "Please login to your HorseShipt account for details and to send a quote.",
        }),
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
            pickupCoords: shipment.pickupCoords,
            deliveryLocation: shipment.deliveryLocation,
            deliveryCoords: shipment.deliveryCoords,
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
        message: apiResponse.QUOTE_REQUEST_ALREADY_EXISTS,
      });
    }

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
