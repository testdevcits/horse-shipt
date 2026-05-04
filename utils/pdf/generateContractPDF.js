const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

async function generateContractPDF({
  shipment,
  shipmentCode,
  customer,
  shipper,
  vehicle,
  quote,
  shipperSignature,
  customerSignature = null,
}) {
  return new Promise((resolve, reject) => {
    try {
      const PAGE_MARGIN = 60;
      const PAGE_WIDTH = 595.28;
      const PAGE_HEIGHT = 841.89;
      const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;

      const doc = new PDFDocument({
        size: "A4",
        margin: PAGE_MARGIN,
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
      doc.rect(0, 0, doc.page.width, 90).fill("#BF9B53");

      const logoPath = path.join(__dirname, "../../assets/logo.png");
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, PAGE_MARGIN, 22, { width: 55 });
      }

      doc
        .fillColor("#ffffff")
        .font("Title")
        .fontSize(22)
        .text("HORSESHIPT™", PAGE_MARGIN, 28, {
          align: "right",
          width: CONTENT_WIDTH,
        });

      doc
        .font("Bold")
        .fontSize(12)
        .text(`Shipment Code: ${shipmentCode || "N/A"}`, PAGE_MARGIN, 55, {
          align: "right",
          width: CONTENT_WIDTH,
        });

      doc.fillColor("#000000");
      doc.y = 115;

      /* ===================== TITLE ===================== */
      doc.font("Bold").fontSize(18).text("SHIPMENT CONTRACT", {
        align: "center",
      });

      doc.moveDown(1.5);

      /* ===================== HELPERS ===================== */

      const sectionTitle = (text) => {
        doc.moveDown(0.5);
        doc.font("Bold").fontSize(13).fillColor("#000000");
        doc.text(text.toUpperCase());
        doc.moveDown(0.4);
      };

      const drawRow = (label, value) => {
        const labelWidth = 140;
        const valueWidth = CONTENT_WIDTH - labelWidth;

        const startY = doc.y;

        // Label
        doc
          .font("Bold")
          .fontSize(10)
          .fillColor("#000000")
          .text(label, PAGE_MARGIN, startY, {
            width: labelWidth,
          });

        // Value (wrapped automatically)
        doc
          .font("Roboto")
          .fontSize(10)
          .fillColor("#2E86AB")
          .text(value || "N/A", PAGE_MARGIN + labelWidth, startY, {
            width: valueWidth,
          });

        const endY = doc.y;
        doc.y = endY + 5; // spacing after row
      };

      /* ===================== CONTENT ===================== */

      sectionTitle("Customer Information");
      drawRow("Name:", customer?.name);
      drawRow("Email:", customer?.email);

      sectionTitle("Shipment Details");
      drawRow("Pickup Location:", shipment?.pickupLocation);
      drawRow("Delivery Location:", shipment?.deliveryLocation);
      drawRow("Number of Horses:", shipment?.numberOfHorses?.toString());

      sectionTitle("Shipper & Quote Details");
      drawRow("Shipper Name:", shipper?.name);
      drawRow("Shipper Email:", shipper?.email);
      drawRow("Vehicle:", vehicle?.vehicleNumber);
      drawRow("Transport Type:", vehicle?.transportType);
      drawRow(
        "Total Price:",
        `${quote?.totalPrice || 0} ${quote?.currency || ""}`
      );
      drawRow("Payment Method:", quote?.paymentMethod);
      drawRow("Payment Due:", quote?.paymentDue);
      drawRow("Pickup Time:", quote?.pickupTime);
      drawRow("Estimated Arrival:", quote?.estimatedArrivalTime);

      if (quote?.notes) {
        sectionTitle("Notes");
        doc.font("Roboto").fontSize(10).fillColor("#2E86AB").text(quote.notes, {
          width: CONTENT_WIDTH,
        });
      }

      /* ===================== SIGNATURES ===================== */

      doc.moveDown(2);

      const signatureStartY = doc.y;

      doc.font("Bold").fontSize(11).fillColor("#000000");
      doc.text("SHIPPER SIGNATURE:", PAGE_MARGIN, signatureStartY);

      if (shipperSignature) {
        const shipperImg = Buffer.from(
          shipperSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        doc.image(shipperImg, PAGE_MARGIN, signatureStartY + 15, {
          fit: [200, 70],
        });
      }

      doc.text("CUSTOMER SIGNATURE:", PAGE_MARGIN + 260, signatureStartY);

      if (customerSignature) {
        const customerImg = Buffer.from(
          customerSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        doc.image(customerImg, PAGE_MARGIN + 260, signatureStartY + 15, {
          fit: [200, 70],
        });
      }

      /* ===================== FOOTER ===================== */
      doc
        .fontSize(6)
        .fillColor("#888888")
        .text(
          `Digitally issued shipment contract | Ref: ${shipmentCode || "N/A"}`,
          PAGE_MARGIN,
          PAGE_HEIGHT - PAGE_MARGIN - 20,
          {
            align: "center",
            width: CONTENT_WIDTH,
          }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateContractPDF;
