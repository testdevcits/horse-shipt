const TermsCondition = require("../../models/admin/TermsCondition");

// =====================================
// CREATE / ADD TERMS & CONDITIONS
// =====================================
const createTermsCondition = async (req, res) => {
  try {
    let { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Content is required" });
    }

    // Sirf ek hi active Terms rakhenge
    const existing = await TermsCondition.findOne({ isActive: true });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Terms & Conditions already exists" });
    }

    const terms = await TermsCondition.create({
      content: content.trim(),
    });

    return res.status(201).json({
      message: "Terms & Conditions created successfully",
      data: terms,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// =====================================
// GET ALL TERMS (Admin Paginated)
// =====================================
const getTermsConditions = async (req, res) => {
  try {
    let { page = 1, limit = 10, showInactive = false } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const filter = showInactive === "true" ? {} : { isActive: true };

    const total = await TermsCondition.countDocuments(filter);

    const terms = await TermsCondition.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      success: true,
      count: terms.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: terms,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// =====================================
// GET SINGLE ACTIVE TERMS (Public)
// =====================================
const getActiveTermsCondition = async (req, res) => {
  try {
    const terms = await TermsCondition.findOne({ isActive: true });

    if (!terms) {
      return res.status(404).json({ message: "Terms & Conditions not found" });
    }

    return res.status(200).json({
      success: true,
      data: terms,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// =====================================
// UPDATE TERMS
// =====================================
const updateTermsCondition = async (req, res) => {
  try {
    const { content } = req.body;

    const terms = await TermsCondition.findById(req.params.id);
    if (!terms) {
      return res.status(404).json({ message: "Terms & Conditions not found" });
    }

    terms.content = content || terms.content;
    await terms.save();

    return res.status(200).json({
      message: "Terms & Conditions updated successfully",
      data: terms,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// =====================================
// DELETE TERMS (Soft Delete)
// =====================================
const deleteTermsCondition = async (req, res) => {
  try {
    const terms = await TermsCondition.findById(req.params.id);
    if (!terms) {
      return res.status(404).json({ message: "Terms & Conditions not found" });
    }

    terms.isActive = false;
    await terms.save();

    return res
      .status(200)
      .json({ message: "Terms & Conditions deactivated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// =====================================
// ACTIVATE / DEACTIVATE
// =====================================
const updateTermsConditionStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res
        .status(400)
        .json({ message: "isActive must be true or false" });
    }

    const terms = await TermsCondition.findById(req.params.id);
    if (!terms) {
      return res.status(404).json({ message: "Terms & Conditions not found" });
    }

    terms.isActive = isActive;
    await terms.save();

    return res.status(200).json({
      message: `Terms & Conditions ${
        isActive ? "activated" : "deactivated"
      } successfully`,
      data: terms,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createTermsCondition,
  getTermsConditions,
  getActiveTermsCondition,
  updateTermsCondition,
  deleteTermsCondition,
  updateTermsConditionStatus,
};
