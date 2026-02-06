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
      const PAGE_MARGIN = 60; // 🔥 PRINT SAFE MARGIN
      const CONTENT_WIDTH = 475;

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

      /* reset */
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
          .text(text.toUpperCase(), PAGE_MARGIN, doc.y, {
            width: CONTENT_WIDTH,
          });
        doc.moveDown(0.4);
      };

      const drawRow = (label, value) => {
        doc.font("Bold").text(label, PAGE_MARGIN, doc.y, { continued: true });
        doc.font("Roboto").text(value || "N/A", {
          width: CONTENT_WIDTH,
        });
        doc.moveDown(0.35);
      };

      /* ===================== CONTENT ===================== */
      sectionTitle("Customer Information");
      drawRow("Name: ", customer.name);
      drawRow("Email: ", customer.email);
      doc.moveDown(0.6);

      sectionTitle("Shipment Details");
      drawRow("Pickup Location: ", shipment.pickupLocation);
      drawRow("Pickup Date: ", shipment.pickupDate?.toDateString());
      drawRow("Delivery Location: ", shipment.deliveryLocation);
      drawRow("Delivery Date: ", shipment.deliveryDate?.toDateString());
      drawRow("Number of Horses: ", shipment.numberOfHorses?.toString());
      doc.moveDown(0.6);

      sectionTitle("Shipper & Quote Details");
      drawRow("Shipper Name: ", shipper.name);
      drawRow("Shipper Email: ", shipper.email);
      drawRow("Vehicle: ", vehicle.vehicleNumber);
      drawRow("Transport Type: ", vehicle.transportType);
      drawRow("Total Price: ", `${quote.totalPrice} ${quote.currency}`);
      drawRow("Payment Method: ", quote.paymentMethod);
      drawRow("Payment Due: ", quote.paymentDue);
      drawRow("Pickup Time: ", quote.pickupTime);
      drawRow("Estimated Arrival: ", quote.estimatedArrivalTime);

      if (quote.notes) {
        doc.moveDown(0.5);
        doc.font("Bold").text("NOTES:", PAGE_MARGIN);
        doc.font("Roboto").text(quote.notes, {
          width: CONTENT_WIDTH,
          height: 70,
          ellipsis: true,
        });
      }

      /* ===================== SIGNATURES ===================== */
      const signatureY = doc.page.height - 170;

      if (shipperSignature) {
        const shipperImg = Buffer.from(
          shipperSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );

        doc
          .font("Bold")
          .text("SHIPPER SIGNATURE:", PAGE_MARGIN, signatureY - 25);

        doc.image(shipperImg, PAGE_MARGIN, signatureY, {
          fit: [190, 70], // 🔥 BIGGER & CLEAR
        });
      }

      if (customerSignature) {
        const customerImg = Buffer.from(
          customerSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );

        doc
          .font("Bold")
          .text("CUSTOMER SIGNATURE:", PAGE_MARGIN + 260, signatureY - 25);

        doc.image(customerImg, PAGE_MARGIN + 260, signatureY, {
          fit: [190, 70],
        });
      } else {
        doc
          .font("Bold")
          .text("CUSTOMER SIGNATURE:", PAGE_MARGIN + 260, signatureY - 25);
      }

      /* ===================== FOOTER (LOCKED) ===================== */
      doc
        .fontSize(6)
        .fillColor("#bbbbbb")
        .opacity(0.7)
        .text(
          `Digitally generated contract | Ref: ${shipmentCode}-${customer._id}`,
          PAGE_MARGIN,
          doc.page.height - 40,
          {
            align: "center",
            width: CONTENT_WIDTH,
          }
        )
        .opacity(1);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateContractPDF;
