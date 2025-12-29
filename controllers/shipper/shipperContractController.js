const ShipperContract = require("../../models/shipper/shipperContractModel");
const cloudinary = require("../../config/cloudinary"); // adjust path if needed

// ===================================================
// @desc    Upload contract (First time)
// @route   POST /api/shipper/contracts/upload
// @access  Private (Shipper)
// ===================================================
exports.uploadContract = async (req, res) => {
  try {
    const shipperId = req.user._id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a contract file",
      });
    }

    // Check if contract already exists
    const existingContract = await ShipperContract.findOne({
      shipper: shipperId,
      isActive: true,
    });

    if (existingContract) {
      return res.status(400).json({
        success: false,
        message: "Contract already exists. Please update instead.",
      });
    }

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: "shipper_contracts",
      resource_type: "raw", // for PDF / DOC files
    });

    const contract = await ShipperContract.create({
      shipper: shipperId,
      contractFile: {
        url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
      },
      uploadedBy: "shipper",
    });

    res.status(201).json({
      success: true,
      message: "Contract uploaded successfully",
      data: contract,
    });
  } catch (error) {
    console.error("Upload Contract Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload contract",
      error: error.message,
    });
  }
};

// ===================================================
// @desc    Update / Replace contract
// @route   PUT /api/shipper/contracts/update
// @access  Private (Shipper)
// ===================================================
exports.updateContract = async (req, res) => {
  try {
    const shipperId = req.user._id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a contract file",
      });
    }

    const contract = await ShipperContract.findOne({
      shipper: shipperId,
      isActive: true,
    });

    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "No active contract found to update",
      });
    }

    // Delete old file from Cloudinary
    if (contract.contractFile?.public_id) {
      await cloudinary.uploader.destroy(contract.contractFile.public_id, {
        resource_type: "raw",
      });
    }

    // Upload new contract
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: "shipper_contracts",
      resource_type: "raw",
    });

    contract.contractFile = {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    };

    // Optional: update version
    contract.version = `v${Date.now()}`;

    await contract.save();

    res.status(200).json({
      success: true,
      message: "Contract updated successfully",
      data: contract,
    });
  } catch (error) {
    console.error("Update Contract Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update contract",
      error: error.message,
    });
  }
};

// ===================================================
// @desc    Get my active contract
// @route   GET /api/shipper/contracts/my
// @access  Private (Shipper)
// ===================================================
exports.getMyContract = async (req, res) => {
  try {
    const shipperId = req.user._id;

    const contract = await ShipperContract.findOne({
      shipper: shipperId,
      isActive: true,
    });

    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "No active contract found",
      });
    }

    res.status(200).json({
      success: true,
      data: contract,
    });
  } catch (error) {
    console.error("Get Contract Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch contract",
      error: error.message,
    });
  }
};

// ===================================================
// @desc    Deactivate contract (Soft delete)
// @route   PATCH /api/shipper/contracts/deactivate
// @access  Private (Shipper)
// ===================================================
exports.deactivateContract = async (req, res) => {
  try {
    const shipperId = req.user._id;

    const contract = await ShipperContract.findOne({
      shipper: shipperId,
      isActive: true,
    });

    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "No active contract found to deactivate",
      });
    }

    contract.isActive = false;
    await contract.save();

    res.status(200).json({
      success: true,
      message: "Contract deactivated successfully",
    });
  } catch (error) {
    console.error("Deactivate Contract Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to deactivate contract",
      error: error.message,
    });
  }
};
