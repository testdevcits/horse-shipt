const PrivacyPolicy = require("../../models/admin/PrivacyPolicy");

// =====================================
// CREATE / ADD PRIVACY POLICY
// =====================================
const createPrivacyPolicy = async (req, res) => {
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

    const policy = await PrivacyPolicy.create({
      title: title.trim(),
      content: content.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Privacy Policy created successfully",
      data: policy,
    });
  } catch (error) {
    console.error("CREATE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating Privacy Policy",
    });
  }
};

// =====================================
// GET ALL POLICIES (Admin Paginated)
// =====================================
const getPrivacyPolicies = async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // No filter → get ALL policies
    const filter = {};

    const total = await PrivacyPolicy.countDocuments(filter);

    const policies = await PrivacyPolicy.find(filter)
      .sort({ createdAt: -1 }) // latest first
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      success: true,
      message: "Privacy Policies fetched successfully",
      count: policies.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: policies,
    });
  } catch (error) {
    console.error("GET ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching policies",
    });
  }
};

// =====================================
// GET SINGLE ACTIVE POLICY (Public)
// =====================================
const getActivePrivacyPolicy = async (req, res) => {
  try {
    const policies = await PrivacyPolicy.find({ isActive: true }).sort({
      createdAt: 1,
    });

    if (!policies || policies.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Privacy Policy not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Privacy Policy fetched successfully",
      data: policies,
    });
  } catch (error) {
    console.error("ACTIVE FETCH ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching policy",
    });
  }
};

// =====================================
// UPDATE POLICY
// =====================================
const updatePrivacyPolicy = async (req, res) => {
  try {
    const { title, content } = req.body;

    const policy = await PrivacyPolicy.findById(req.params.id);

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: "Privacy Policy not found",
      });
    }

    if (title) policy.title = title.trim();
    if (content) policy.content = content.trim();

    await policy.save();

    return res.status(200).json({
      success: true,
      message: "Privacy Policy updated successfully",
      data: policy,
    });
  } catch (error) {
    console.error("UPDATE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating policy",
    });
  }
};

// =====================================
// DELETE POLICY (Soft Delete)
// =====================================
const deletePrivacyPolicy = async (req, res) => {
  try {
    const policy = await PrivacyPolicy.findByIdAndDelete(req.params.id);

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: "Privacy Policy not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Privacy Policy permanently deleted successfully",
    });
  } catch (error) {
    console.error("DELETE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting policy",
    });
  }
};

// =====================================
// ACTIVATE / DEACTIVATE
// =====================================
const updatePrivacyPolicyStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false",
      });
    }

    const policy = await PrivacyPolicy.findById(req.params.id);

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: "Privacy Policy not found",
      });
    }

    policy.isActive = isActive;
    await policy.save();

    return res.status(200).json({
      success: true,
      message: `Privacy Policy ${
        isActive ? "activated" : "deactivated"
      } successfully`,
      data: policy,
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
  createPrivacyPolicy,
  getPrivacyPolicies,
  getActivePrivacyPolicy,
  updatePrivacyPolicy,
  deletePrivacyPolicy,
  updatePrivacyPolicyStatus,
};
