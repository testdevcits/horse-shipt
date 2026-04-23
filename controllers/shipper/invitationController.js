const Invitation = require("../../models/common/ShipmentInvitation");

exports.getMyInvitations = async (req, res) => {
  try {
    const invites = await Invitation.find({
      shipper: req.user.id,
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: invites.length,
      data: invites,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
