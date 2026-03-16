const PrivacyPolicy = require("../../models/admin/PrivacyPolicy");

// =====================================
// CREATE / ADD PRIVACY POLICY
// =====================================
const createPrivacyPolicy = async (req, res) => {
  try {
    let { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Content is required" });
    }

    // Sirf ek hi active Privacy Policy rakhenge
    const existing = await PrivacyPolicy.findOne({ isActive: true });
    if (existing) {
      return res.status(400).json({ message: "Privacy Policy already exists" });
    }

    const policy = await PrivacyPolicy.create({
      content: content.trim(),
    });

    return res.status(201).json({
      message: "Privacy Policy created successfully",
      data: policy,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// =====================================
// GET ALL POLICIES (Admin Paginated)
// =====================================
const getPrivacyPolicies = async (req, res) => {
  try {
    let { page = 1, limit = 10, showInactive = false } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const filter = showInactive === "true" ? {} : { isActive: true };

    const total = await PrivacyPolicy.countDocuments(filter);

    const policies = await PrivacyPolicy.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      success: true,
      count: policies.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: policies,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// =====================================
// GET SINGLE ACTIVE POLICY (Public)
// =====================================
const getActivePrivacyPolicy = async (req, res) => {
  try {
    const policy = await PrivacyPolicy.findOne({ isActive: true });

    if (!policy) {
      return res.status(404).json({ message: "Privacy Policy not found" });
    }

    return res.status(200).json({
      success: true,
      data: policy,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// =====================================
// UPDATE POLICY
// =====================================
const updatePrivacyPolicy = async (req, res) => {
  try {
    const { content } = req.body;

    const policy = await PrivacyPolicy.findById(req.params.id);
    if (!policy) {
      return res.status(404).json({ message: "Privacy Policy not found" });
    }

    policy.content = content || policy.content;
    await policy.save();

    return res.status(200).json({
      message: "Privacy Policy updated successfully",
      data: policy,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// =====================================
// DELETE POLICY (Soft Delete)
// =====================================
const deletePrivacyPolicy = async (req, res) => {
  try {
    const policy = await PrivacyPolicy.findById(req.params.id);
    if (!policy) {
      return res.status(404).json({ message: "Privacy Policy not found" });
    }

    policy.isActive = false;
    await policy.save();

    return res
      .status(200)
      .json({ message: "Privacy Policy deactivated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// =====================================
// ACTIVATE / DEACTIVATE
// =====================================
const updatePrivacyPolicyStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res
        .status(400)
        .json({ message: "isActive must be true or false" });
    }

    const policy = await PrivacyPolicy.findById(req.params.id);
    if (!policy) {
      return res.status(404).json({ message: "Privacy Policy not found" });
    }

    policy.isActive = isActive;
    await policy.save();

    return res.status(200).json({
      message: `Privacy Policy ${
        isActive ? "activated" : "deactivated"
      } successfully`,
      data: policy,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
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
