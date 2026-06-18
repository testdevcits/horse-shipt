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

      const drawOptionalRow = (label, value) => {
        if (value === undefined || value === null || value === "") return;
        drawRow(label, value);
      };

      const getHorsePhotoUrl = (horse = {}) =>
        horse.photo?.url ||
        horse.image?.url ||
        horse.images?.[0]?.url ||
        horse.horseImage?.url ||
        "";

      const fetchImageBuffer = async (url) => {
        if (!url || typeof fetch !== "function") return null;
        const response = await fetch(url);
        if (!response.ok) return null;
        return Buffer.from(await response.arrayBuffer());
      };

      const drawContainedImage = (image, x, y, width, height) => {
        doc.save();
        doc.rect(x, y, width, height).fill("#F8FAFC");
        doc.restore();
        doc.image(image, x, y, {
          fit: [width, height],
          align: "center",
          valign: "center",
        });
      };

      /* ===================== CONTENT ===================== */

      sectionTitle("Customer Information");
      drawRow("Name:", customer?.name);
      drawRow("Email:", customer?.email);

      sectionTitle("Shipment Details");
      drawRow("Pickup Location:", shipment?.pickupLocation);
      drawRow("Delivery Location:", shipment?.deliveryLocation);
      drawRow("Number of Horses:", shipment?.numberOfHorses?.toString());

      const horsePhotos = Array.isArray(shipment?.horses)
        ? shipment.horses
            .map((horse) => ({
              name:
                horse.registeredName ||
                horse.name ||
                horse.barnName ||
                "Horse",
              url: getHorsePhotoUrl(horse),
            }))
            .filter((horse) => horse.url)
            .slice(0, 3)
        : [];

      if (horsePhotos.length) {
        sectionTitle("Horse Images");
        const imageWidth = (CONTENT_WIDTH - 20) / 3;
        const imageHeight = 82;
        const startY = doc.y;

        for (let index = 0; index < horsePhotos.length; index += 1) {
          const horse = horsePhotos[index];
          const imageBuffer = await fetchImageBuffer(horse.url);
          const x = PAGE_MARGIN + index * (imageWidth + 10);

          if (imageBuffer) {
            drawContainedImage(imageBuffer, x, startY, imageWidth, imageHeight);
          }

          doc
            .font("Roboto")
            .fontSize(8)
            .fillColor("#4B5563")
            .text(horse.name, x, startY + imageHeight + 4, {
              width: imageWidth,
              align: "center",
              ellipsis: true,
            });
        }

        doc.y = startY + imageHeight + 20;
      }

      sectionTitle("Shipper & Quote Details");
      drawRow("Shipper Name:", shipper?.name);
      drawRow("Shipper Email:", shipper?.email);
      drawOptionalRow("Vehicle:", vehicle?.vehicleNumber);
      drawOptionalRow("Transport Type:", vehicle?.transportType);
      drawRow(
        "Total Price:",
        `${quote?.totalPrice || 0} ${quote?.currency || ""}`
      );
      drawRow("Payment Method:", quote?.paymentMethod);
      drawRow("Payment Due:", quote?.paymentDue);
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
          align: "center",
          valign: "center",
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
          align: "center",
          valign: "center",
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
