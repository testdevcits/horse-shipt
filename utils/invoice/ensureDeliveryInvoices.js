const streamifier = require("streamifier");
const cloudinary = require("../cloudinary");
const generateTaxInvoicePDF = require("../pdf/generateTaxInvoicePDF");

const sanitizePublicId = (value = "invoice") =>
  String(value)
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "invoice";

const uploadPdf = ({ buffer, folder, publicId }) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder,
        public_id: `${sanitizePublicId(publicId)}.pdf`,
        overwrite: true,
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });

const ensureDeliveryInvoices = async ({ quote, shipment }) => {
  if (!quote || !shipment) return quote;
  if (quote.taxInvoices?.customer?.url && quote.taxInvoices?.shipper?.url) {
    return quote;
  }

  const populatedQuote = quote.populate
    ? await quote.populate([
        { path: "shipper" },
        { path: "shipment", populate: { path: "customer shipper" } },
      ])
    : quote;

  const invoiceShipment = populatedQuote.shipment || shipment;
  const customer = invoiceShipment.customer || shipment.customer || {};
  const shipper = populatedQuote.shipper || invoiceShipment.shipper || {};
  const shipmentCode = invoiceShipment.shipmentCode || quote._id.toString();

  const customerBuffer = await generateTaxInvoicePDF({
    quote: populatedQuote,
    shipment: invoiceShipment,
    customer,
    shipper,
    role: "customer",
  });
  const shipperBuffer = await generateTaxInvoicePDF({
    quote: populatedQuote,
    shipment: invoiceShipment,
    customer,
    shipper,
    role: "shipper",
  });

  const [customerUpload, shipperUpload] = await Promise.all([
    uploadPdf({
      buffer: customerBuffer,
      folder: "tax_invoices/customer",
      publicId: `${shipmentCode}-customer-invoice`,
    }),
    uploadPdf({
      buffer: shipperBuffer,
      folder: "tax_invoices/shipper",
      publicId: `${shipmentCode}-shipper-invoice`,
    }),
  ]);

  populatedQuote.taxInvoices = {
    customer: {
      url: customerUpload.secure_url,
      public_id: customerUpload.public_id,
      invoiceNumber: `INV-C-${shipmentCode}`,
      generatedAt: new Date(),
    },
    shipper: {
      url: shipperUpload.secure_url,
      public_id: shipperUpload.public_id,
      invoiceNumber: `INV-S-${shipmentCode}`,
      generatedAt: new Date(),
    },
  };
  populatedQuote.markModified?.("taxInvoices");

  return populatedQuote;
};

module.exports = ensureDeliveryInvoices;
