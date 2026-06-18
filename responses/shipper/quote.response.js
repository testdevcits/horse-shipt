const shipperQuoteResponse = {
  SENT: "Quote sent successfully",
  FETCHED: "Quotes fetched successfully",
  NOT_FOUND: "Quote not found",
  ALREADY_ACTIVE: "You already have an active quote for this shipment. If the customer rejects it, you can send a new quote.",
  FAILED_TO_SEND: "Failed to send quote",
  DELETED: "Quote deleted successfully",
  ACCEPTED_QUOTE_DELETE_BLOCKED: "Accepted quote cannot be deleted",
  VEHICLE_ASSIGNED: "Vehicle and driver assigned successfully",
};

module.exports = { shipperQuoteResponse };
