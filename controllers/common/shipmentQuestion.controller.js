const { apiResponse } = require("../../responses/api.response");
const ShipmentQuestion = require("../../models/common/ShipmentQuestion");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const { emitToUser } = require("../../sockets/realtimeSocket");
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
        message: apiResponse.SHIPMENT_ID_AND_QUESTION_ARE_REQUIRED,
      });
    }

    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPMENT_NOT_FOUND,
      });
    }

    const newQuestion = await ShipmentQuestion.create({
      shipmentId,
      shipperId,
      customerId: shipment.customer,
      question: question.trim(),
      readByShipperAt: new Date(),
    });

    emitToUser(req.app.get("io"), {
      role: "customer",
      userId: shipment.customer,
      event: "horse_shipt:shipment_question",
      payload: {
        question: newQuestion,
        shipmentId,
        shipmentCode: shipment.shipmentCode,
      },
      notification: {
        type: "question",
        title: "New shipment question",
        message: `A shipper asked a question about ${
          shipment.shipmentCode || "your shipment"
        }.`,
      },
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
      message: apiResponse.QUESTION_SUBMITTED_SUCCESSFULLY,
      data: newQuestion,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: apiResponse.YOU_HAVE_ALREADY_ASKED_A_QUESTION_FOR_THIS_SHIPMENT,
      });
    }

    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_SUBMIT_QUESTION,
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
        message: apiResponse.QUESTION_ID_AND_ANSWER_ARE_REQUIRED,
      });
    }

    const questionDoc = await ShipmentQuestion.findById(questionId);
    if (!questionDoc) {
      return res.status(404).json({
        success: false,
        message: apiResponse.QUESTION_NOT_FOUND,
      });
    }

    if (questionDoc.customerId.toString() !== customerId.toString()) {
      return res.status(403).json({
        success: false,
        message: apiResponse.YOU_ARE_NOT_ALLOWED_TO_ANSWER_THIS_QUESTION,
      });
    }

    if (questionDoc.status === "answered") {
      return res.status(400).json({
        success: false,
        message: apiResponse.THIS_QUESTION_HAS_ALREADY_BEEN_ANSWERED,
      });
    }

    questionDoc.answer = answer.trim();
    questionDoc.status = "answered";
    questionDoc.answeredAt = new Date();
    questionDoc.readByCustomerAt = questionDoc.readByCustomerAt || new Date();
    questionDoc.readByShipperAt = null;

    await questionDoc.save();

    const shipment = await CustomerShipment.findById(questionDoc.shipmentId)
      .select("shipmentCode")
      .lean();

    emitToUser(req.app.get("io"), {
      role: "shipper",
      userId: questionDoc.shipperId,
      event: "horse_shipt:shipment_question_answered",
      payload: {
        question: questionDoc,
        shipmentId: questionDoc.shipmentId,
        shipmentCode: shipment?.shipmentCode,
      },
      notification: {
        type: "question",
        title: "Question answered",
        message: `A customer answered your question about ${
          shipment?.shipmentCode || "a shipment"
        }.`,
      },
    });

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
      message: apiResponse.ANSWER_SUBMITTED_SUCCESSFULLY,
      data: questionDoc,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_SUBMIT_ANSWER,
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
        message: apiResponse.SHIPMENT_ID_IS_REQUIRED,
      });
    }

    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPMENT_NOT_FOUND,
      });
    }

    let answeredQuestions = [];
    let pendingQuestions = [];

    // ================= CUSTOMER VIEW =================
    if (req.user.role === "customer") {
      if (shipment.customer.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: apiResponse.YOU_ARE_NOT_ALLOWED_TO_VIEW_THESE_QUESTIONS,
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

      await ShipmentQuestion.updateMany(
        {
          shipmentId,
          customerId: userId,
          status: "pending",
          readByCustomerAt: null,
        },
        { $set: { readByCustomerAt: new Date() } }
      );
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

      await ShipmentQuestion.updateMany(
        {
          shipmentId,
          shipperId: userId,
          status: "answered",
          readByShipperAt: null,
        },
        { $set: { readByShipperAt: new Date() } }
      );
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
      message: apiResponse.FAILED_TO_FETCH_QUESTIONS,
      error: error.message,
    });
  }
};
