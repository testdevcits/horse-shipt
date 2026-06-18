const { apiResponse } = require("../../responses/api.response");
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
        message: apiResponse.TITLE_IS_REQUIRED,
      });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: apiResponse.CONTENT_IS_REQUIRED,
      });
    }

    const policy = await PrivacyPolicy.create({
      title: title.trim(),
      content: content.trim(),
    });

    return res.status(201).json({
      success: true,
      message: apiResponse.PRIVACY_POLICY_CREATED_SUCCESSFULLY,
      data: policy,
    });
  } catch (error) {
    console.error("CREATE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.SERVER_ERROR_WHILE_CREATING_PRIVACY_POLICY,
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
      message: apiResponse.PRIVACY_POLICIES_FETCHED_SUCCESSFULLY,
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
      message: apiResponse.SERVER_ERROR_WHILE_FETCHING_POLICIES,
    });
  }
};

// =====================================
// GET SINGLE ACTIVE POLICY (Public)
// =====================================
const getActivePrivacyPolicy = async (req, res) => {
  try {
    // Find all active policies, latest first
    const policies = await PrivacyPolicy.find({ isActive: true }).sort({
      createdAt: -1,
    });

    if (!policies || policies.length === 0) {
      return res.status(404).json({
        success: false,
        message: apiResponse.NO_ACTIVE_PRIVACY_POLICIES_FOUND,
      });
    }

    return res.status(200).json({
      success: true,
      message: apiResponse.ACTIVE_PRIVACY_POLICIES_FETCHED_SUCCESSFULLY,
      count: policies.length,
      data: policies,
    });
  } catch (error) {
    console.error("ACTIVE FETCH ERROR:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.SERVER_ERROR_WHILE_FETCHING_ACTIVE_POLICIES,
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
        message: apiResponse.PRIVACY_POLICY_NOT_FOUND,
      });
    }

    if (title) policy.title = title.trim();
    if (content) policy.content = content.trim();

    await policy.save();

    return res.status(200).json({
      success: true,
      message: apiResponse.PRIVACY_POLICY_UPDATED_SUCCESSFULLY,
      data: policy,
    });
  } catch (error) {
    console.error("UPDATE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.SERVER_ERROR_WHILE_UPDATING_POLICY,
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
        message: apiResponse.PRIVACY_POLICY_NOT_FOUND,
      });
    }

    return res.status(200).json({
      success: true,
      message: apiResponse.PRIVACY_POLICY_PERMANENTLY_DELETED_SUCCESSFULLY,
    });
  } catch (error) {
    console.error("DELETE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.SERVER_ERROR_WHILE_DELETING_POLICY,
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
        message: apiResponse.ISACTIVE_MUST_BE_TRUE_OR_FALSE,
      });
    }

    const policy = await PrivacyPolicy.findById(req.params.id);

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: apiResponse.PRIVACY_POLICY_NOT_FOUND,
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
      message: apiResponse.SERVER_ERROR_WHILE_UPDATING_STATUS,
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
