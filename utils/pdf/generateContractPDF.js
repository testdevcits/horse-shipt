const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

async function generateContractPDF({
  shipment,
  customer,
  shipper,
  vehicle,
  quote,
  shipperSignature,
  customerSignature = null,
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        autoFirstPage: true,
      });

      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      /* ===================== FONTS ===================== */
      doc.registerFont(
        "Roboto",
        path.join(__dirname, "../../assets/fonts/RobotoSlab-Regular.ttf")
      );
      doc.registerFont(
        "Bold",
        path.join(__dirname, "../../assets/fonts/OpenSans-Bold.ttf")
      );
      doc.registerFont(
        "Title",
        path.join(__dirname, "../../assets/fonts/Oswald-Bold.ttf")
      );

      /* ===================== HEADER ===================== */
      const logoPath = path.join(__dirname, "../../assets/logo.png");
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 20, { width: 60 });
      }

      doc.font("Title").fontSize(22).text("HorseShipt™", 120, 25);
      doc.moveDown(0.5);
      doc.font("Bold").fontSize(18).text("Shipment Contract", {
        align: "center",
      });
      doc.moveDown(1.2);

      /* ===================== HELPERS ===================== */
      const drawRow = (label, value) => {
        doc.font("Bold").text(label, { continued: true });
        doc.font("Roboto").text(value || "N/A");
        doc.moveDown(0.3);
      };

      /* ===================== CONTENT ===================== */
      doc
        .font("Bold")
        .fontSize(13)
        .text("Customer Information", { underline: true });
      doc.moveDown(0.3);
      drawRow("Name: ", customer.name);
      drawRow("Email: ", customer.email);
      drawRow("Shipment ID: ", shipment._id.toString());
      doc.moveDown(0.5);

      doc
        .font("Bold")
        .fontSize(13)
        .text("Shipment Details", { underline: true });
      doc.moveDown(0.3);
      drawRow("Pickup Location: ", shipment.pickupLocation);
      drawRow("Pickup Date: ", shipment.pickupDate?.toDateString());
      drawRow("Delivery Location: ", shipment.deliveryLocation);
      drawRow("Delivery Date: ", shipment.deliveryDate?.toDateString());
      drawRow("Number of Horses: ", shipment.numberOfHorses?.toString());
      doc.moveDown(0.5);

      doc
        .font("Bold")
        .fontSize(13)
        .text("Shipper & Quote Details", { underline: true });
      doc.moveDown(0.3);
      drawRow("Shipper Name: ", shipper.name);
      drawRow("Shipper Email: ", shipper.email);
      drawRow("Vehicle: ", vehicle.vehicleNumber);
      drawRow("Transport Type: ", vehicle.transportType);
      drawRow("Total Price: ", `${quote.totalPrice} ${quote.currency}`);
      drawRow("Payment Method: ", quote.paymentMethod);
      drawRow("Payment Due: ", quote.paymentDue);
      drawRow("Pickup Time: ", quote.pickupTime);
      drawRow("Estimated Arrival: ", quote.estimatedArrivalTime);

      /* ===================== NOTES (HEIGHT LIMITED) ===================== */
      if (quote.notes) {
        doc.moveDown(0.5);
        doc.font("Bold").text("Notes:");
        doc.font("Roboto").text(quote.notes, {
          height: 60, // 🔒 LIMIT HEIGHT → NO PAGE BREAK
          ellipsis: true,
        });
      }

      /* ===================== SIGNATURES (FIXED SAFE ZONE) ===================== */
      const safeSignatureY = doc.page.height - 120;

      if (shipperSignature) {
        const shipperImg = Buffer.from(
          shipperSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );

        doc.font("Bold").text("Shipper Signature:", 50, safeSignatureY - 15);
        doc.image(shipperImg, 50, safeSignatureY, {
          fit: [150, 45],
        });
      }

      if (customerSignature) {
        const customerImg = Buffer.from(
          customerSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );

        doc.font("Bold").text("Customer Signature:", 350, safeSignatureY - 15);
        doc.image(customerImg, 350, safeSignatureY, {
          fit: [150, 45],
        });
      } else {
        doc.font("Bold").text("Customer Signature:", 350, safeSignatureY - 15);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateContractPDF;
