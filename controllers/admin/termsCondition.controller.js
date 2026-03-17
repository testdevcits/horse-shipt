const TermsCondition = require("../../models/admin/TermsCondition");

// =====================================
// CREATE / ADD TERMS & CONDITIONS
// =====================================
const createTermsCondition = async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Title is required",
      });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "Content is required",
      });
    }

    const terms = await TermsCondition.create({
      title: title.trim(),
      content: content.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Terms & Conditions created successfully",
      data: terms,
    });
  } catch (error) {
    console.error("CREATE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating Terms & Conditions",
    });
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
      message: "Terms & Conditions fetched successfully",
      count: terms.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: terms,
    });
  } catch (error) {
    console.error("GET ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching Terms & Conditions",
    });
  }
};

// =====================================
// GET ACTIVE TERMS (Public - LIST)
// =====================================
const getActiveTermsCondition = async (req, res) => {
  try {
    const terms = await TermsCondition.find({ isActive: true }).sort({
      createdAt: 1,
    });

    if (!terms || terms.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Terms & Conditions not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Terms & Conditions fetched successfully",
      data: terms, // 👈 list return
    });
  } catch (error) {
    console.error("ACTIVE FETCH ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching Terms & Conditions",
    });
  }
};

// =====================================
// UPDATE TERMS
// =====================================
const updateTermsCondition = async (req, res) => {
  try {
    const { title, content } = req.body;

    const terms = await TermsCondition.findById(req.params.id);

    if (!terms) {
      return res.status(404).json({
        success: false,
        message: "Terms & Conditions not found",
      });
    }

    if (title) terms.title = title.trim();
    if (content) terms.content = content.trim();

    await terms.save();

    return res.status(200).json({
      success: true,
      message: "Terms & Conditions updated successfully",
      data: terms,
    });
  } catch (error) {
    console.error("UPDATE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating Terms & Conditions",
    });
  }
};

// =====================================
// DELETE TERMS (Soft Delete)
// =====================================
const deleteTermsCondition = async (req, res) => {
  try {
    const terms = await TermsCondition.findById(req.params.id);

    if (!terms) {
      return res.status(404).json({
        success: false,
        message: "Terms & Conditions not found",
      });
    }

    terms.isActive = false;
    await terms.save();

    return res.status(200).json({
      success: true,
      message: "Terms & Conditions deleted successfully",
    });
  } catch (error) {
    console.error("DELETE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting Terms & Conditions",
    });
  }
};

// =====================================
// ACTIVATE / DEACTIVATE
// =====================================
const updateTermsConditionStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false",
      });
    }

    const terms = await TermsCondition.findById(req.params.id);

    if (!terms) {
      return res.status(404).json({
        success: false,
        message: "Terms & Conditions not found",
      });
    }

    terms.isActive = isActive;
    await terms.save();

    return res.status(200).json({
      success: true,
      message: `Terms & Conditions ${
        isActive ? "activated" : "deactivated"
      } successfully`,
      data: terms,
    });
  } catch (error) {
    console.error("STATUS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating status",
    });
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
