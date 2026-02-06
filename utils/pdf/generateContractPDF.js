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
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
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
      doc.rect(0, 0, doc.page.width, 80).fill("#BF9B53");

      const logoPath = path.join(__dirname, "../../assets/logo.png");
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 18, { width: 50 });
      }

      doc
        .fillColor("#ffffff")
        .font("Title")
        .fontSize(22)
        .text("HORSESHIPT™", 0, 26, {
          align: "right",
          width: doc.page.width - 50,
        });

      doc
        .font("Bold")
        .fontSize(9)
        .text(shipmentCode || "", 0, 52, {
          align: "right",
          width: doc.page.width - 50,
        });

      /* 🔴 VERY IMPORTANT: reset cursor after header */
      doc.fillColor("#000000");
      doc.y = 100;

      /* ===================== TITLE ===================== */
      doc
        .font("Bold")
        .fontSize(18)
        .text("SHIPMENT CONTRACT", { align: "center" });

      doc.moveDown(1);

      /* ===================== HELPERS ===================== */
      const sectionTitle = (text) => {
        doc.font("Bold").fontSize(13).text(text.toUpperCase());
        doc.moveDown(0.25);
      };

      const drawRow = (label, value) => {
        doc.font("Bold").text(label, { continued: true });
        doc.font("Roboto").text(value || "N/A");
        doc.moveDown(0.2);
      };

      /* ===================== CONTENT ===================== */
      sectionTitle("Customer Information");
      drawRow("Name: ", customer.name);
      drawRow("Email: ", customer.email);
      doc.moveDown(0.4);

      sectionTitle("Shipment Details");
      drawRow("Pickup Location: ", shipment.pickupLocation);
      drawRow("Pickup Date: ", shipment.pickupDate?.toDateString());
      drawRow("Delivery Location: ", shipment.deliveryLocation);
      drawRow("Delivery Date: ", shipment.deliveryDate?.toDateString());
      drawRow("Number of Horses: ", shipment.numberOfHorses?.toString());
      doc.moveDown(0.4);

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
        doc.moveDown(0.3);
        doc.font("Bold").text("NOTES:");
        doc.font("Roboto").text(quote.notes, {
          height: 55,
          ellipsis: true,
        });
      }

      /* ===================== SIGNATURES ===================== */
      const safeSignatureY = doc.page.height - 130;

      if (shipperSignature) {
        const shipperImg = Buffer.from(
          shipperSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );

        doc.font("Bold").text("SHIPPER SIGNATURE:", 50, safeSignatureY - 22);
        doc.image(shipperImg, 50, safeSignatureY + 8, {
          fit: [150, 45],
        });
      }

      if (customerSignature) {
        const customerImg = Buffer.from(
          customerSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );

        doc.font("Bold").text("CUSTOMER SIGNATURE:", 350, safeSignatureY - 22);
        doc.image(customerImg, 350, safeSignatureY + 8, {
          fit: [150, 45],
        });
      } else {
        doc.font("Bold").text("CUSTOMER SIGNATURE:", 350, safeSignatureY - 22);
      }

      /* ===================== SECURITY FOOTER ===================== */
      doc
        .opacity(0.6)
        .fontSize(6)
        .fillColor("#cccccc")
        .text(
          `Digitally generated contract | Ref: ${
            shipmentCode || shipment._id
          }-${customer._id}`,
          0,
          doc.page.height - 30,
          { align: "center" }
        )
        .opacity(1);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateContractPDF;
