const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

/**
 * Generate Shipment Contract PDF in Table Format
 * @param {Object} params
 * @param {Object} params.shipment - CustomerShipment document
 * @param {Object} params.customer - Customer info
 * @param {Object} params.shipper - Shipper info
 * @param {Object} params.vehicle - Vehicle info
 * @param {Object} params.quote - Quote info
 * @param {string} params.shipperSignature - Base64 shipper signature
 * @param {string} [params.customerSignature] - Optional Base64 customer signature
 * @returns {Promise<Buffer>} - PDF buffer
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

      // Fonts
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
      doc.registerFont("OpenSansBold", openSansBold);
      doc.registerFont("OswaldBold", oswaldBold);

      // Logo
      const logoPath = path.join(__dirname, "../../assets/logo.png");
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 20, { width: 60 });
      }

      // Title
      doc.font("OswaldBold").fontSize(22).text("HorseShipt™", 120, 25);
      doc
        .font("OpenSansBold")
        .fontSize(18)
        .text("Shipment Contract", { align: "center" });
      doc.moveDown(2);

      // Helper function for table rows
      const drawRow = (label, value, y) => {
        doc.font("OpenSansBold").text(label, 50, y);
        doc.font("Roboto").text(value || "N/A", 200, y);
      };

      let yPos = doc.y;

      // Customer Info Table
      doc
        .font("OpenSansBold")
        .fontSize(14)
        .text("Customer Information", { underline: true });
      yPos = doc.y + 5;
      drawRow("Name:", customer.name, yPos);
      yPos += 20;
      drawRow("Email:", customer.email, yPos);
      yPos += 20;
      drawRow("Shipment ID:", shipment._id.toString(), yPos);
      yPos += 30;

      // Shipment Details Table
      doc
        .font("OpenSansBold")
        .fontSize(14)
        .text("Shipment Details", 50, yPos, { underline: true });
      yPos = doc.y + 5;
      drawRow("Pickup Location:", shipment.pickupLocation, yPos);
      yPos += 20;
      drawRow("Pickup Date:", shipment.pickupDate?.toDateString(), yPos);
      yPos += 20;
      drawRow("Delivery Location:", shipment.deliveryLocation, yPos);
      yPos += 20;
      drawRow("Delivery Date:", shipment.deliveryDate?.toDateString(), yPos);
      yPos += 20;
      drawRow("Number of Horses:", shipment.numberOfHorses.toString(), yPos);
      yPos += 30;

      // Horses Table
      if (shipment.horses?.length) {
        doc
          .font("OpenSansBold")
          .text("Horses Information", 50, yPos, { underline: true });
        yPos = doc.y + 5;
        shipment.horses.forEach((h, idx) => {
          doc
            .font("Roboto")
            .text(
              `${idx + 1}. Name: ${h.registeredName}, Breed: ${h.breed}, Age: ${
                h.age
              }, Sex: ${h.sex}`,
              50,
              yPos
            );
          yPos += 20;
        });
        yPos += 10;
      }

      // Shipper + Quote Table
      doc
        .font("OpenSansBold")
        .text("Shipper & Quote Details", 50, yPos, { underline: true });
      yPos = doc.y + 5;
      drawRow("Shipper Name:", shipper.name, yPos);
      yPos += 20;
      drawRow("Shipper Email:", shipper.email, yPos);
      yPos += 20;
      drawRow("Vehicle:", vehicle.vehicleNumber, yPos);
      yPos += 20;
      drawRow("Transport Type:", vehicle.transportType, yPos);
      yPos += 20;
      drawRow("Total Price:", `${quote.totalPrice} ${quote.currency}`, yPos);
      yPos += 20;
      drawRow("Payment Method:", quote.paymentMethod, yPos);
      yPos += 20;
      drawRow("Payment Due:", quote.paymentDue, yPos);
      yPos += 20;
      drawRow("Pickup Time:", quote.pickupTime, yPos);
      yPos += 20;
      drawRow("Estimated Arrival:", quote.estimatedArrivalTime, yPos);
      yPos += 30;

      if (quote.notes) {
        doc.font("OpenSansBold").text("Notes:", 50, yPos);
        doc.font("Roboto").text(quote.notes, 200, yPos);
        yPos += 40;
      }

      // Signatures
      const bottomY = doc.page.height - 150;

      // Shipper Signature
      if (shipperSignature) {
        const shipperImg = Buffer.from(
          shipperSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        doc.font("OpenSansBold").text("Shipper Signature:", 50, bottomY);
        doc.image(shipperImg, 50, bottomY + 20, { width: 150, height: 50 });
      }

      // Customer Signature
      if (customerSignature) {
        const customerImg = Buffer.from(
          customerSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        doc.font("OpenSansBold").text("Customer Signature:", 350, bottomY);
        doc.image(customerImg, 350, bottomY + 20, { width: 150, height: 50 });
      } else {
        // Placeholder
        doc.font("OpenSansBold").text("Customer Signature:", 350, bottomY);
        doc.rect(350, bottomY + 20, 150, 50).stroke();
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateContractPDF;
