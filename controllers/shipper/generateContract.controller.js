const ShipperContract = require("../../models/shipper/shipperContractModel");
const cloudinary = require("../../config/cloudinary"); // cloudinary config
const pdf = require("pdfkit"); // for PDF generation
const fs = require("fs");
const path = require("path");

// ===================================================
// @desc    Generate contract PDF (Initial)
// @route   POST /api/shipper/contracts/generate
// @access  Private (Shipper)
// ===================================================
exports.generateContract = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { shipmentId, title, description } = req.body;

    if (!shipmentId) {
      return res
        .status(400)
        .json({ success: false, message: "Shipment ID required" });
    }

    // create PDF
    const doc = new pdf();
    const tempPath = path.join(
      __dirname,
      `../../temp/contract_${Date.now()}.pdf`
    );
    doc.pipe(fs.createWriteStream(tempPath));

    doc.fontSize(20).text("Contract Agreement", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(`Title: ${title || "Shipment Contract"}`);
    doc.text(`Description: ${description || "Contract Details"}`);
    doc.text(`Shipper ID: ${shipperId}`);
    doc.text(`Shipment ID: ${shipmentId}`);
    doc.end();

    // wait for stream to finish
    await new Promise((resolve) => doc.on("finish", resolve));

    // Upload PDF to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(tempPath, {
      folder: "shipper_contracts",
      resource_type: "raw",
    });

    // Remove temp file
    fs.unlinkSync(tempPath);

    // Save contract record
    const contract = await ShipperContract.create({
      shipper: shipperId,
      shipment: shipmentId,
      title,
      description,
      contractFile: {
        url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
      },
      status: "SENT",
      uploadedBy: "shipper",
    });

    res.status(201).json({ success: true, data: contract });
  } catch (err) {
    console.error("Generate Contract Error:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to generate contract",
        error: err.message,
      });
  }
};

// ===================================================
// @desc    Customer signs contract
// @route   POST /api/customer/contracts/:id/sign
// @access  Private (Customer)
// ===================================================
exports.customerSignContract = async (req, res) => {
  try {
    const customerId = req.user._id;
    const contractId = req.params.id;

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Signature file required" });
    }

    const contract = await ShipperContract.findById(contractId);
    if (!contract)
      return res
        .status(404)
        .json({ success: false, message: "Contract not found" });

    // Upload customer signature
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: "customer_signatures",
      resource_type: "image",
    });

    contract.customer = customerId;
    contract.customerSignature = {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    };
    contract.customerSignedAt = new Date();

    // If shipper also signed, mark SIGNED
    if (contract.shipperSignature) {
      contract.status = "SIGNED";
    }

    await contract.save();

    res.status(200).json({ success: true, data: contract });
  } catch (err) {
    console.error("Customer Sign Error:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to sign contract",
        error: err.message,
      });
  }
};

// ===================================================
// @desc    Generate final PDF with both signatures
// @route   POST /api/contracts/:id/finalize
// @access  Private (Shipper / System)
// ===================================================
exports.finalizeContract = async (req, res) => {
  try {
    const contractId = req.params.id;

    const contract = await ShipperContract.findById(contractId);
    if (!contract)
      return res
        .status(404)
        .json({ success: false, message: "Contract not found" });

    if (!contract.shipperSignature || !contract.customerSignature) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Both parties must sign before finalizing",
        });
    }

    // Generate final PDF
    const doc = new pdf();
    const tempPath = path.join(
      __dirname,
      `../../temp/final_contract_${Date.now()}.pdf`
    );
    doc.pipe(fs.createWriteStream(tempPath));

    doc.fontSize(20).text("Final Contract", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(`Title: ${contract.title}`);
    doc.text(`Description: ${contract.description}`);
    doc.text(`Shipper ID: ${contract.shipper}`);
    doc.text(`Customer ID: ${contract.customer}`);
    doc.text(`Shipment ID: ${contract.shipment}`);
    doc.moveDown();

    doc.text("Shipper Signature:");
    doc.image(contract.shipperSignature.url, { width: 150 });
    doc.moveDown();

    doc.text("Customer Signature:");
    doc.image(contract.customerSignature.url, { width: 150 });
    doc.end();

    // wait for stream to finish
    await new Promise((resolve) => doc.on("finish", resolve));

    // Upload final PDF to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(tempPath, {
      folder: "final_contracts",
      resource_type: "raw",
    });

    // Remove temp file
    fs.unlinkSync(tempPath);

    contract.finalPDF = {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    };

    contract.status = "ACCEPTED";
    await contract.save();

    res.status(200).json({ success: true, data: contract });
  } catch (err) {
    console.error("Finalize Contract Error:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to finalize contract",
        error: err.message,
      });
  }
};
