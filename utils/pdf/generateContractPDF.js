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
  return new Promise(async (resolve, reject) => {
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
      doc.rect(0, 0, doc.page.width, 86).fill("#BF9B53");

      const logoPath = path.join(__dirname, "../../assets/logo.png");
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, PAGE_MARGIN, 20, { width: 52 });
      }

      doc
        .fillColor("#ffffff")
        .font("Title")
        .fontSize(21)
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
      doc.y = 108;

      /* ===================== TITLE ===================== */
      doc.font("Bold").fontSize(18).fillColor("#111827").text("SHIPMENT CONTRACT", {
        align: "center",
      });

      doc.moveDown(1);

      /* ===================== HELPERS ===================== */
      const safeValue = (value) => {
        if (value === undefined || value === null || value === "") return "N/A";
        return String(value);
      };

      const formatDate = (value) => {
        if (!value) return "N/A";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "N/A";
        return date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      };

      const formatDateRange = (range, fallback) => {
        const start = range?.start || fallback;
        const end = range?.end || fallback;
        const startText = formatDate(start);
        const endText = formatDate(end);

        if (startText === "N/A") return endText;
        if (endText === "N/A" || startText === endText) return startText;
        return `${startText} - ${endText}`;
      };

      const ensureSpace = (height = 80) => {
        if (doc.y + height > PAGE_HEIGHT - PAGE_MARGIN - 28) {
          doc.addPage();
          doc.y = PAGE_MARGIN;
        }
      };

      const sectionTitle = (text) => {
        ensureSpace(36);
        doc.moveDown(0.45);
        const y = doc.y;
        doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 22).fill("#F8F4EA");
        doc
          .font("Bold")
          .fontSize(11)
          .fillColor("#735D32")
          .text(text.toUpperCase(), PAGE_MARGIN + 12, y + 6, {
            width: CONTENT_WIDTH - 24,
          });
        doc.y = y + 30;
      };

      const drawRow = (label, value) => {
        ensureSpace(26);
        const labelWidth = 122;
        const valueWidth = CONTENT_WIDTH - labelWidth - 16;
        const startY = doc.y;
        const cleanValue = safeValue(value);
        const valueHeight = doc
          .font("Roboto")
          .fontSize(9.5)
          .heightOfString(cleanValue, {
            width: valueWidth,
          });
        const rowHeight = Math.max(22, valueHeight + 10);

        doc.rect(PAGE_MARGIN, startY, CONTENT_WIDTH, rowHeight).stroke("#E5E7EB");
        doc
          .rect(PAGE_MARGIN, startY, labelWidth, rowHeight)
          .fillAndStroke("#FBFAF7", "#E5E7EB");

        doc
          .font("Bold")
          .fontSize(9)
          .fillColor("#374151")
          .text(label, PAGE_MARGIN + 8, startY + 7, {
            width: labelWidth - 16,
          });

        doc
          .font("Roboto")
          .fontSize(9.5)
          .fillColor("#1F2937")
          .text(cleanValue, PAGE_MARGIN + labelWidth + 8, startY + 7, {
            width: valueWidth,
          });

        doc.y = startY + rowHeight;
      };

      const drawOptionalRow = (label, value) => {
        if (value === undefined || value === null || value === "") return;
        drawRow(label, value);
      };

      /* ===================== CONTENT ===================== */

      sectionTitle("Customer Information");
      drawRow("Name", customer?.name);
      drawRow("Email", customer?.email);
      drawOptionalRow("Phone", customer?.phone);

      sectionTitle("Shipment Details");
      drawRow("Pickup Location", shipment?.pickupLocation);
      drawRow("Delivery Location", shipment?.deliveryLocation);
      drawOptionalRow(
        "Pickup Date",
        formatDateRange(shipment?.pickupDateRange, shipment?.pickupDate)
      );
      drawOptionalRow(
        "Delivery Date",
        formatDateRange(shipment?.deliveryDateRange, shipment?.deliveryDate)
      );
      drawRow("Number of Horses", shipment?.numberOfHorses?.toString());
      drawOptionalRow("Estimated Distance", shipment?.estimatedDistance);

      const horses = Array.isArray(shipment?.horses) ? shipment.horses : [];

      if (horses.length) {
        sectionTitle("Horse Details");
        horses.forEach((horse, index) => {
          const horseName =
            horse.registeredName || horse.name || horse.barnName || `Horse ${index + 1}`;
          const horseFacts = [
            horse.barnName ? `Barn Name: ${horse.barnName}` : null,
            horse.breed ? `Breed: ${horse.breed}` : null,
            horse.sex ? `Sex: ${horse.sex}` : null,
            horse.age ? `Age: ${horse.age}` : null,
            horse.colour || horse.color
              ? `Color: ${horse.colour || horse.color}`
              : null,
            horse.stallType ? `Stall Type: ${horse.stallType}` : null,
          ]
            .filter(Boolean)
            .join(" | ");

          drawRow(
            horses.length > 1 ? `Horse ${index + 1}` : "Horse",
            horseFacts ? `${horseName}\n${horseFacts}` : horseName
          );
        });
      }

      sectionTitle("Shipper & Quote Details");
      drawRow("Shipper Name", shipper?.companyName || shipper?.name);
      drawRow("Shipper Email", shipper?.email);
      drawOptionalRow("Vehicle", vehicle?.vehicleNumber);
      drawOptionalRow("Vehicle Type", vehicle?.vehicleType);
      drawOptionalRow("Transport Type", quote?.transportType || vehicle?.transportType);
      drawOptionalRow("Stalls Required", quote?.stallsRequired);
      drawOptionalRow("Delivery Days", quote?.estimatedDeliveryDays);
      drawRow(
        "Total Price",
        `${quote?.totalPrice || 0} ${quote?.currency || ""}`
      );
      drawRow("Payment Method", quote?.paymentMethod);
      drawRow("Payment Due", quote?.paymentDue);
      if (quote?.notes) {
        sectionTitle("Notes");
        drawRow("Quote Notes", quote.notes);
      }

      /* ===================== SIGNATURES ===================== */

      ensureSpace(115);
      doc.moveDown(1.2);

      const signatureStartY = doc.y;
      const signatureWidth = (CONTENT_WIDTH - 34) / 2;
      const signatureHeight = 84;

      doc
        .rect(PAGE_MARGIN, signatureStartY, signatureWidth, signatureHeight)
        .stroke("#D1D5DB");
      doc
        .rect(
          PAGE_MARGIN + signatureWidth + 34,
          signatureStartY,
          signatureWidth,
          signatureHeight
        )
        .stroke("#D1D5DB");

      doc.font("Bold").fontSize(10).fillColor("#111827");
      doc.text("SHIPPER SIGNATURE", PAGE_MARGIN + 10, signatureStartY + 8);

      if (shipperSignature) {
        const shipperImg = Buffer.from(
          shipperSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        doc.image(shipperImg, PAGE_MARGIN + 20, signatureStartY + 25, {
          fit: [signatureWidth - 40, 46],
          align: "center",
          valign: "center",
        });
      }

      doc.text(
        "CUSTOMER SIGNATURE",
        PAGE_MARGIN + signatureWidth + 44,
        signatureStartY + 8
      );

      if (customerSignature) {
        const customerImg = Buffer.from(
          customerSignature.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        doc.image(
          customerImg,
          PAGE_MARGIN + signatureWidth + 54,
          signatureStartY + 25,
          {
            fit: [signatureWidth - 40, 46],
            align: "center",
            valign: "center",
          }
        );
      }

      doc.y = signatureStartY + signatureHeight + 8;
      doc
        .font("Roboto")
        .fontSize(8)
        .fillColor("#6B7280")
        .text(`Issued: ${new Date().toLocaleString("en-US")}`, PAGE_MARGIN, doc.y, {
          width: CONTENT_WIDTH,
          align: "center",
        });

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
