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
      const PAGE_WIDTH = 595.28; // A4 width in pt
      const PAGE_HEIGHT = 841.89; // A4 height in pt
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
        .fontSize(9)
        .text(shipmentCode || "", PAGE_MARGIN, 58, {
          align: "right",
          width: CONTENT_WIDTH,
        });

      doc.fillColor("#000000");
      doc.y = 115;

      /* ===================== TITLE ===================== */
      doc.font("Bold").fontSize(18).text("SHIPMENT CONTRACT", {
        align: "center",
        width: CONTENT_WIDTH,
      });

      doc.moveDown(1.2);

      /* ===================== HELPERS ===================== */
      const sectionTitle = (text) => {
        doc
          .font("Bold")
          .fontSize(13)
          .fillColor("#000000")
          .text(text.toUpperCase(), PAGE_MARGIN, doc.y, {
            width: CONTENT_WIDTH,
          });
        doc.moveDown(0.4);
      };

      const drawRow = (label, value) => {
        doc
          .font("Bold")
          .fontSize(10)
          .fillColor("#000000")
          .text(label, PAGE_MARGIN, doc.y, {
            continued: true,
          });
        doc
          .font("Roboto")
          .fontSize(10)
          .fillColor("#2E86AB") // 💙 value color
          .text(value || "N/A", PAGE_MARGIN + 100, doc.y, {
            width: CONTENT_WIDTH - 100,
            align: "left",
            lineGap: 2,
          });
        doc.moveDown(0.35);
      };

      /* ===================== CONTENT ===================== */
      sectionTitle("Customer Information");
      drawRow("Name:", customer.name);
      drawRow("Email:", customer.email);
      doc.moveDown(0.4);

      sectionTitle("Shipment Details");
      drawRow("Pickup Location:", shipment.pickupLocation);
      drawRow("Pickup Date:", shipment.pickupDate?.toDateString());
      drawRow("Delivery Location:", shipment.deliveryLocation);
      drawRow("Delivery Date:", shipment.deliveryDate?.toDateString());
      drawRow("Number of Horses:", shipment.numberOfHorses?.toString());
      doc.moveDown(0.4);

      sectionTitle("Shipper & Quote Details");
      drawRow("Shipper Name:", shipper.name);
      drawRow("Shipper Email:", shipper.email);
      drawRow("Vehicle:", vehicle.vehicleNumber);
      drawRow("Transport Type:", vehicle.transportType);
      drawRow("Total Price:", `${quote.totalPrice} ${quote.currency}`);
      drawRow("Payment Method:", quote.paymentMethod);
      drawRow("Payment Due:", quote.paymentDue);
      drawRow("Pickup Time:", quote.pickupTime);
      drawRow("Estimated Arrival:", quote.estimatedArrivalTime);

      if (quote.notes) {
        doc.moveDown(0.4);
        doc.font("Bold").fillColor("#000000").text("NOTES:", PAGE_MARGIN);
        doc.font("Roboto").fillColor("#2E86AB").text(quote.notes, {
          width: CONTENT_WIDTH,
          lineGap: 2,
        });
      }

      /* ===================== SIGNATURES ===================== */
      const signatureHeight = 70;
      const signatureY = PAGE_HEIGHT - PAGE_MARGIN - signatureHeight - 50; // footer safe

      if (shipperSignature) {
        const shipperImg = Buffer.from(
          shipperSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        doc
          .font("Bold")
          .fillColor("#000000")
          .text("SHIPPER SIGNATURE:", PAGE_MARGIN, signatureY - 25);
        doc.image(shipperImg, PAGE_MARGIN, signatureY, {
          fit: [190, signatureHeight],
        });
      }

      if (customerSignature) {
        const customerImg = Buffer.from(
          customerSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        doc
          .font("Bold")
          .fillColor("#000000")
          .text("CUSTOMER SIGNATURE:", PAGE_MARGIN + 260, signatureY - 25);
        doc.image(customerImg, PAGE_MARGIN + 260, signatureY, {
          fit: [190, signatureHeight],
        });
      } else {
        doc
          .font("Bold")
          .fillColor("#000000")
          .text("CUSTOMER SIGNATURE:", PAGE_MARGIN + 260, signatureY - 25);
      }

      /* ===================== FOOTER ===================== */
      doc
        .fontSize(6)
        .fillColor("#888888") // subtle gray
        .opacity(0.7)
        .text(
          `Digitally generated contract | Ref: ${shipmentCode}-${customer._id}`,
          PAGE_MARGIN,
          PAGE_HEIGHT - PAGE_MARGIN - 20,
          { align: "center", width: CONTENT_WIDTH }
        )
        .opacity(1);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateContractPDF;
