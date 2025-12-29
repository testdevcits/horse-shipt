const PDFDocument = require("pdfkit");
const fs = require("fs-extra");
const path = require("path");

async function generateContractPDF({
  shipper,
  shipment,
  totalPrice,
  contractTitle,
}) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const fileName = `Contract_${Date.now()}.pdf`;
      const filePath = path.join(__dirname, "..", "tmp", fileName);

      // Ensure tmp folder exists
      await fs.ensureDir(path.join(__dirname, "..", "tmp"));

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // ================= PDF CONTENT =================
      doc
        .fontSize(20)
        .text(contractTitle || "Shipper Contract", { align: "center" });
      doc.moveDown();

      doc.fontSize(14).text(`Shipper Name: ${shipper.name}`);
      doc.text(`Shipper Email: ${shipper.email}`);
      doc.text(`Shipper Phone: ${shipper.phone}`);
      doc.moveDown();

      doc.text(`Shipment ID: ${shipment._id}`);
      doc.text(`Pickup: ${shipment.pickupLocation}`);
      doc.text(`Dropoff: ${shipment.dropoffLocation}`);
      doc.text(`Shipment Type: ${shipment.shipmentType}`);
      doc.text(`Total Price: ${totalPrice}`);
      doc.moveDown();

      doc.text("Terms & Conditions:");
      doc.text("1. The shipper will handle the shipment with care.");
      doc.text("2. Payment to be done as per agreed terms.");
      doc.text("3. Contract is valid once signed by both parties.");
      doc.moveDown();

      doc.text("Signature Shipper: ______________________", { align: "left" });
      doc.text("Signature Customer: ______________________", { align: "left" });

      doc.end();

      writeStream.on("finish", () => {
        resolve(filePath);
      });

      writeStream.on("error", (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateContractPDF;
