const ShipmentQuestion = require("../../models/common/ShipmentQuestion");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const { notifyQuestionReceiver } = require("../../utils/chatNotificationService");

// ========================================================
// SHIPPER: ASK QUESTION
// ========================================================
exports.askQuestion = async (req, res) => {
  try {
    const { shipmentId, question } = req.body;
    const shipperId = req.user._id; // from shipperAuth

    if (!shipmentId || !question || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: "Shipment ID and question are required",
      });
    }

    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    const newQuestion = await ShipmentQuestion.create({
      shipmentId,
      shipperId,
      customerId: shipment.customer,
      question: question.trim(),
    });

    notifyQuestionReceiver({
      receiverRole: "customer",
      receiverId: shipment.customer,
      senderRole: "shipper",
      shipmentId,
      action: "asked",
      text: question.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Question submitted successfully",
      data: newQuestion,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already asked a question for this shipment",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to submit question",
      error: error.message,
    });
  }
};

// ========================================================
// CUSTOMER: ANSWER QUESTION
// ========================================================
exports.answerQuestion = async (req, res) => {
  try {
    const { questionId, answer } = req.body;
    const customerId = req.user._id; // from customerAuth

    if (!questionId || !answer || !answer.trim()) {
      return res.status(400).json({
        success: false,
        message: "Question ID and answer are required",
      });
    }

    const questionDoc = await ShipmentQuestion.findById(questionId);
    if (!questionDoc) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    if (questionDoc.customerId.toString() !== customerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to answer this question",
      });
    }

    if (questionDoc.status === "answered") {
      return res.status(400).json({
        success: false,
        message: "This question has already been answered",
      });
    }

    questionDoc.answer = answer.trim();
    questionDoc.status = "answered";
    questionDoc.answeredAt = new Date();

    await questionDoc.save();

    notifyQuestionReceiver({
      receiverRole: "shipper",
      receiverId: questionDoc.shipperId,
      senderRole: "customer",
      shipmentId: questionDoc.shipmentId,
      action: "answered",
      text: answer.trim(),
    });

    return res.json({
      success: true,
      message: "Answer submitted successfully",
      data: questionDoc,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to submit answer",
      error: error.message,
    });
  }
};

// ========================================================
// GET QUESTIONS (CUSTOMER / SHIPPER) - SAFE POPULATE
// ========================================================
exports.getShipmentQuestions = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const userId = req.user._id;

    if (!shipmentId) {
      return res.status(400).json({
        success: false,
        message: "Shipment ID is required",
      });
    }

    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    let answeredQuestions = [];
    let pendingQuestions = [];

    // ================= CUSTOMER VIEW =================
    if (req.user.role === "customer") {
      if (shipment.customer.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: "You are not allowed to view these questions",
        });
      }

      answeredQuestions = await ShipmentQuestion.find({
        shipmentId,
        status: "answered",
      })
        .populate({
          path: "shipperId",
          select: "name companyName",
          options: { strictPopulate: false }, // safe populate
        })
        .sort({ createdAt: -1 })
        .lean();

      pendingQuestions = await ShipmentQuestion.find({
        shipmentId,
        status: "pending",
      })
        .populate({
          path: "shipperId",
          select: "name companyName",
          options: { strictPopulate: false },
        })
        .sort({ createdAt: -1 })
        .lean();
    }
    // ================= SHIPPER VIEW =================
    else {
      answeredQuestions = await ShipmentQuestion.find({
        shipmentId,
        shipperId: userId,
        status: "answered",
      }).sort({ createdAt: -1 });

      pendingQuestions = await ShipmentQuestion.find({
        shipmentId,
        shipperId: userId,
        status: "pending",
      }).sort({ createdAt: -1 });
    }

    return res.json({
      success: true,
      data: {
        answered: answeredQuestions,
        pending: pendingQuestions,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch questions",
      error: error.message,
    });
  }
};
