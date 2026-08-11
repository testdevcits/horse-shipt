const PDFDocument = require("pdfkit");
const path = require("path");

const money = (amount = 0, currency = "USD") =>
  `${currency || "USD"} ${Number(amount || 0).toFixed(2)}`;

const toAmount = (value = 0) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const deductionMoney = (amount = 0, currency = "USD") => {
  const value = toAmount(amount);
  return value > 0 ? `-${money(value, currency)}` : money(0, currency);
};

const formatPercent = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${Number.isInteger(number) ? number : number.toFixed(2)}%`;
};

const formatDate = (value = new Date()) =>
  new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const getInvoiceNumber = ({ shipmentCode, role }) => {
  const suffix = role === "shipper" ? "S" : "C";
  return `INV-${suffix}-${shipmentCode || Date.now()}`;
};

const presentLines = (lines = []) =>
  lines
    .map((line) => String(line || "").trim())
    .filter((line) => line && line.toUpperCase() !== "N/A");

const buildPlatformFeeReference = ({ platformSettings, currency, baseAmount }) => {
  const percent = formatPercent(platformSettings?.platformFeePercent);
  const flat = Number(platformSettings?.platformFeeFlat || 0);
  const parts = [];

  if (percent) parts.push(`Rate: ${percent} of ${money(baseAmount, currency)}`);
  if (flat > 0) parts.push(`Flat: ${money(flat, currency)}`);

  return parts.length ? parts.join(" | ") : "HorseShipt service fee";
};

const buildStripeFeeReference = ({ currency }) =>
  `Rate: 2.9% + ${money(0.3, currency)}`;

const buildRows = ({ quote, shipment, role, platformSettings }) => {
  const currency = quote.currency || "USD";
  const gross = toAmount(quote.totalPrice);
  const platformFee = toAmount(quote.platformFee);
  const stripeFee = toAmount(quote.stripeFee);
  const platformFeeBase = Math.max(gross - stripeFee, 0);
  const shipperNet =
    toAmount(quote.shipperPayoutAmount) ||
    Math.max(gross - platformFee - stripeFee, 0);

  if (role === "shipper") {
    const rows = [
      ["Shipment transport payout", shipment.shipmentCode || "N/A", money(gross, currency)],
    ];

    if (platformFee > 0) {
      rows.push(
      [
        "Platform fee",
        buildPlatformFeeReference({
          platformSettings,
          currency,
          baseAmount: platformFeeBase,
        }),
        deductionMoney(platformFee, currency),
      ],
      );
    }

    if (stripeFee > 0) {
      rows.push(
      [
        "Stripe processing fee",
        buildStripeFeeReference({ currency }),
        deductionMoney(stripeFee, currency),
      ],
      );
    }

    rows.push(["Net amount payable to shipper", "Final payout", money(shipperNet, currency)]);
    return rows;
  }

  return [
    ["Horse shipment transport", shipment.shipmentCode || "N/A", money(gross, currency)],
    ["Payment method", quote.paymentMethod || "N/A", quote.paymentStatus || "pending"],
    ["Amount paid by customer", "Final customer charge", money(gross, currency)],
  ];
};

async function generateTaxInvoicePDF({
  quote,
  shipment,
  customer,
  shipper,
  platformSettings,
  role = "customer",
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 46,
        info: {
          Title: getInvoiceNumber({ shipmentCode: shipment.shipmentCode, role }),
          Author: "HorseShipt",
          Subject: "Tax Invoice",
        },
      });

      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const fontRegular = path.join(__dirname, "../../assets/fonts/RobotoSlab-Regular.ttf");
      const fontBold = path.join(__dirname, "../../assets/fonts/OpenSans-Bold.ttf");
      doc.registerFont("Regular", fontRegular);
      doc.registerFont("Bold", fontBold);

      const width = doc.page.width - 92;
      const invoiceNumber = getInvoiceNumber({
        shipmentCode: shipment.shipmentCode,
        role,
      });
      const currency = quote.currency || "USD";
      const total =
        role === "shipper"
          ? toAmount(quote.shipperPayoutAmount) ||
            Math.max(
              toAmount(quote.totalPrice) -
                toAmount(quote.platformFee) -
                toAmount(quote.stripeFee),
              0
            )
          : toAmount(quote.totalPrice);

      doc.fillColor("#111827").font("Bold").fontSize(16).text("HorseShipt", 46, 32);
      doc.font("Bold").fontSize(20).text("TAX INVOICE", 350, 30, {
        width: 195,
        align: "right",
      });
      doc.font("Regular").fontSize(8).fillColor("#4B5563").text(
        role === "shipper" ? "Shipper Copy" : "Customer Copy",
        350,
        56,
        { width: 195, align: "right" }
      );
      doc.rect(46, 78, width, 4).fill("#BF9B53");

      const box = (title, lines, x, y, w) => {
        doc.font("Bold").fontSize(8).fillColor("#111827").text(title, x, y);
        doc.font("Regular").fontSize(8).fillColor("#374151");
        let currentY = y + 14;
        presentLines(lines).forEach((line) => {
          doc.text(line, x, currentY, { width: w, lineGap: 1 });
          currentY += doc.heightOfString(line, { width: w, lineGap: 1 }) + 4;
        });
        return currentY;
      };

      box(
        "PLATFORM DETAILS",
        ["HorseShipt"],
        46,
        96,
        210
      );
      box(
        "INVOICE DETAILS",
        [
          `Invoice No: ${invoiceNumber}`,
          `Invoice Date: ${formatDate(new Date())}`,
          `Shipment Code: ${shipment.shipmentCode || "N/A"}`,
          `Delivered At: ${formatDate(shipment.deliveredAt || quote.deliveredAt)}`,
        ],
        340,
        96,
        205
      );

      doc.moveTo(46, 178).lineTo(545, 178).strokeColor("#D1D5DB").stroke();

      box(
        role === "shipper" ? "BILL TO / SHIPPER" : "BILL TO / CUSTOMER",
        role === "shipper"
          ? [
              shipper.name || shipper.companyName || "Shipper",
              shipper.email,
              shipper.phone,
            ]
          : [customer.name || "Customer", customer.email, customer.phone],
        46,
        196,
        220
      );
      box(
        "SHIPMENT",
        [
          shipment.pickupLocation && `Pickup: ${shipment.pickupLocation}`,
          shipment.deliveryLocation && `Delivery: ${shipment.deliveryLocation}`,
          shipment.numberOfHorses && `Horses: ${shipment.numberOfHorses}`,
        ],
        320,
        196,
        225
      );

      const tableY = 292;
      doc.rect(46, tableY, width, 24).fill("#F8F4EA");
      doc.font("Bold").fontSize(8).fillColor("#111827");
      doc.text("#", 56, tableY + 8, { width: 20 });
      doc.text("Description", 82, tableY + 8, { width: 190 });
      doc.text("Reference / Fee detail", 285, tableY + 8, { width: 145 });
      doc.text("Amount", 450, tableY + 8, { width: 85, align: "right" });

      let y = tableY + 34;
      const rows = buildRows({ quote, shipment, role, platformSettings });
      rows.forEach((row, idx) => {
        doc.font("Regular").fontSize(8).fillColor("#111827");
        doc.text(String(idx + 1), 56, y, { width: 20 });
        doc.text(row[0], 82, y, { width: 190 });
        doc.text(row[1], 285, y, { width: 145 });
        doc.font("Bold").text(row[2], 450, y, { width: 85, align: "right" });
        y += 28;
      });

      doc.moveTo(46, y).lineTo(545, y).strokeColor("#D1D5DB").stroke();
      y += 28;

      doc.font("Bold").fontSize(10).fillColor("#111827").text(
        role === "shipper" ? "Amount payable to shipper" : "Amount paid by customer",
        320,
        y,
        { width: 130 }
      );
      doc.text(money(total, currency), 450, y, { width: 85, align: "right" });

      doc.font("Regular").fontSize(7).fillColor("#4B5563").text(
        "This is a computer-generated invoice issued by HorseShipt. Payment and transaction references are available in shipment/payment details.",
        46,
        720,
        { width }
      );
      doc.text("Page 1 of 1", 486, 785, { width: 60, align: "right" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = generateTaxInvoicePDF;
