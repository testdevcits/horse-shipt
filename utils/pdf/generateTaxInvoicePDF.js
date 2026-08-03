const PDFDocument = require("pdfkit");
const path = require("path");

const money = (amount = 0, currency = "USD") =>
  `${currency || "USD"} ${Number(amount || 0).toFixed(2)}`;

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

const buildRows = ({ quote, shipment, role }) => {
  const currency = quote.currency || "USD";
  const gross = Number(quote.totalPrice || 0);
  const platformFee = Number(quote.platformFee || 0);
  const stripeFee = Number(quote.stripeFee || 0);
  const shipperNet =
    Number(quote.shipperPayoutAmount || 0) ||
    Math.max(gross - platformFee - stripeFee, 0);

  if (role === "shipper") {
    return [
      ["Shipment transport payout", shipment.shipmentCode || "N/A", money(gross, currency)],
      ["Platform fee", "HorseShipt service fee", `-${money(platformFee, currency)}`],
      ["Stripe processing fee", "Payment processing", `-${money(stripeFee, currency)}`],
      ["Net amount payable to shipper", "Final payout", money(shipperNet, currency)],
    ];
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
          ? Number(quote.shipperPayoutAmount || 0) ||
            Math.max(
              Number(quote.totalPrice || 0) -
                Number(quote.platformFee || 0) -
                Number(quote.stripeFee || 0),
              0
            )
          : Number(quote.totalPrice || 0);

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
        lines.forEach((line, idx) => doc.text(line || "N/A", x, y + 14 + idx * 12, { width: w }));
      };

      box(
        "PLATFORM DETAILS",
        ["HorseShipt", "Marketplace / Platform Operator", "United States"],
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
          ? [shipper.name || shipper.companyName || "Shipper", shipper.email || "", shipper.phone || ""]
          : [customer.name || "Customer", customer.email || "", customer.phone || ""],
        46,
        196,
        220
      );
      box(
        "SHIPMENT",
        [
          `Pickup: ${shipment.pickupLocation || "N/A"}`,
          `Delivery: ${shipment.deliveryLocation || "N/A"}`,
          `Horses: ${shipment.numberOfHorses || 1}`,
        ],
        320,
        196,
        225
      );

      const tableY = 292;
      doc.rect(46, tableY, width, 24).fill("#F8F4EA");
      doc.font("Bold").fontSize(8).fillColor("#111827");
      doc.text("#", 56, tableY + 8, { width: 20 });
      doc.text("Description", 82, tableY + 8, { width: 210 });
      doc.text("Reference", 300, tableY + 8, { width: 110 });
      doc.text("Amount", 430, tableY + 8, { width: 105, align: "right" });

      let y = tableY + 34;
      const rows = buildRows({ quote, shipment, role });
      rows.forEach((row, idx) => {
        doc.font("Regular").fontSize(8).fillColor("#111827");
        doc.text(String(idx + 1), 56, y, { width: 20 });
        doc.text(row[0], 82, y, { width: 210 });
        doc.text(row[1], 300, y, { width: 110 });
        doc.font("Bold").text(row[2], 430, y, { width: 105, align: "right" });
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
