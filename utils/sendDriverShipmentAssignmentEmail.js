const nodemailer = require("nodemailer");
const { baseTemplate, detailTable, escapeHtml } = require("./mailTemplates/baseTemplate");

const formatDateRange = (range = {}) => {
  const formatDate = (value) => {
    if (!value) return "Not specified";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Not specified"
      : date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });
  };

  return `${formatDate(range.start)} – ${formatDate(range.end)}`;
};

const sendDriverShipmentAssignmentEmail = async ({ driver, shipment, vehicle }) => {
  if (!driver?.email) return false;

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const rows = [
    { label: "Shipment", value: escapeHtml(shipment.shipmentCode || shipment._id) },
    { label: "Pickup", value: escapeHtml(shipment.pickupLocation) },
    { label: "Pickup dates", value: escapeHtml(formatDateRange(shipment.pickupDateRange)) },
    { label: "Delivery", value: escapeHtml(shipment.deliveryLocation) },
    { label: "Delivery dates", value: escapeHtml(formatDateRange(shipment.deliveryDateRange)) },
    { label: "Horses", value: escapeHtml(shipment.numberOfHorses ?? "Not specified") },
    { label: "Vehicle", value: escapeHtml(`${vehicle.vehicleType || "Vehicle"} · ${vehicle.vehicleNumber || ""}`) },
  ];

  const horseNames = (shipment.horses || [])
    .map((horse) => horse?.barnName || horse?.registeredName)
    .filter(Boolean);
  if (horseNames.length) {
    rows.push({ label: "Horse names", value: escapeHtml(horseNames.join(", ")) });
  }
  if (shipment.pickupTimeOption) {
    rows.push({ label: "Pickup time", value: escapeHtml(shipment.pickupTimeOption) });
  }
  if (shipment.deliveryTimeOption) {
    rows.push({ label: "Delivery time", value: escapeHtml(shipment.deliveryTimeOption) });
  }
  if (shipment.additionalInfo) {
    rows.push({ label: "Shipment notes", value: escapeHtml(shipment.additionalInfo) });
  }

  const subject = `Shipment ${shipment.shipmentCode || "assignment"} assigned to you`;
  const result = await transporter.sendMail({
    from: process.env.EMAIL_FROM || `"HorseShipt" <${process.env.EMAIL_USER}>`,
    to: driver.email,
    subject,
    html: baseTemplate({
      title: "New shipment assigned",
      preheader: `Shipment ${shipment.shipmentCode || "details"} has been assigned to you.`,
      body: `
        <p style="margin:0 0 10px;">Hello ${escapeHtml(driver.name || "Driver")},</p>
        <p style="margin:0;">A vehicle has been assigned to you for this shipment. Please review the trip details below.</p>
        ${detailTable(rows)}
      `,
      note: "Please contact your shipper if you need more information about this assignment.",
    }),
  });

  return Boolean(result.accepted?.length);
};

module.exports = sendDriverShipmentAssignmentEmail;
