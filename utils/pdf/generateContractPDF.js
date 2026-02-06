const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

/**
 * Generate Shipment Contract PDF
 */
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
      const doc = new PDFDocument({ margin: 50, size: "A4" });

      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      /* ===================== FONTS ===================== */
      const robotoRegular = path.join(
        __dirname,
        "../../assets/fonts/RobotoSlab-Regular.ttf"
      );
      const openSansBold = path.join(
        __dirname,
        "../../assets/fonts/OpenSans-Bold.ttf"
      );
      const oswaldBold = path.join(
        __dirname,
        "../../assets/fonts/Oswald-Bold.ttf"
      );

      doc.registerFont("Roboto", robotoRegular);
      doc.registerFont("Bold", openSansBold);
      doc.registerFont("Title", oswaldBold);

      /* ===================== HEADER ===================== */
      const logoPath = path.join(__dirname, "../../assets/logo.png");
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 20, { width: 60 });
      }

      doc.font("Title").fontSize(22).text("HorseShipt™", 120, 25);
      doc.moveDown();
      doc.font("Bold").fontSize(18).text("Shipment Contract", {
        align: "center",
      });

      doc.moveDown(2);

      /* ===================== TABLE HELPERS ===================== */
      const drawRow = (label, value) => {
        doc.font("Bold").text(label, { continued: true });
        doc.font("Roboto").text(value || "N/A");
        doc.moveDown(0.5);
      };

      /* ===================== CUSTOMER INFO ===================== */
      doc.font("Bold").fontSize(14).text("Customer Information", {
        underline: true,
      });
      doc.moveDown(0.5);
      drawRow("Name: ", customer.name);
      drawRow("Email: ", customer.email);
      drawRow("Shipment ID: ", shipment._id.toString());

      doc.moveDown();

      /* ===================== SHIPMENT INFO ===================== */
      doc.font("Bold").fontSize(14).text("Shipment Details", {
        underline: true,
      });
      doc.moveDown(0.5);
      drawRow("Pickup Location: ", shipment.pickupLocation);
      drawRow("Pickup Date: ", shipment.pickupDate?.toDateString());
      drawRow("Delivery Location: ", shipment.deliveryLocation);
      drawRow("Delivery Date: ", shipment.deliveryDate?.toDateString());
      drawRow("Number of Horses: ", shipment.numberOfHorses?.toString());

      doc.moveDown();

      /* ===================== QUOTE INFO ===================== */
      doc.font("Bold").fontSize(14).text("Shipper & Quote Details", {
        underline: true,
      });
      doc.moveDown(0.5);
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
        doc.moveDown();
        doc.font("Bold").text("Notes:");
        doc.font("Roboto").text(quote.notes);
      }

      /* ===================== SIGNATURES ===================== */
      const bottomY = doc.page.height - 140;

      // ----- Shipper Signature -----
      if (shipperSignature) {
        const shipperImg = Buffer.from(
          shipperSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );

        doc.font("Bold").text("Shipper Signature:", 50, bottomY);
        doc.image(shipperImg, 50, bottomY + 20, {
          width: 150,
          height: 50,
        });
      }

      // ----- Customer Signature (SAME STYLE, NO BORDER) -----
      if (customerSignature) {
        const customerImg = Buffer.from(
          customerSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );

        doc.font("Bold").text("Customer Signature:", 350, bottomY);
        doc.image(customerImg, 350, bottomY + 20, {
          width: 150,
          height: 50,
        });
      } else {
        // Just label, no box
        doc.font("Bold").text("Customer Signature:", 350, bottomY);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateContractPDF;
