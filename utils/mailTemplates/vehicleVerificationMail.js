exports.vehicleVerificationMailTemplate = (vehicleNumber, status, message) => {
  const {
    baseTemplate,
    detailTable,
    escapeHtml,
  } = require("./baseTemplate");
  const isVerified = status === "VERIFIED";

  return baseTemplate({
    title: isVerified ? "Vehicle Verified" : "Vehicle Verification Failed",
    preheader: `Vehicle ${vehicleNumber || ""} verification status updated.`,
    body: `
      <p style="margin:0;">Your vehicle verification status has been updated.</p>
      ${detailTable([
        { label: "Vehicle Number", value: escapeHtml(vehicleNumber || "N/A") },
        { label: "Status", value: escapeHtml(status || "N/A") },
        { label: "Message", value: escapeHtml(message || "Verification update") },
      ])}
    `,
    note: "If you have any questions, please contact support.",
  });
};
