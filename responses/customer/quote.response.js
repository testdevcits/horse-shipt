const customerQuoteResponse = {
  ACCEPTED: "Quote accepted & contract signed successfully",
  REJECTED: "Quote rejected successfully",
  CANCELLED: "Quote cancelled successfully",
  NOT_FOUND: "Quote not found",
  ALREADY_ACCEPTED: "Quote already accepted",
  ALREADY_REJECTED: "Quote already rejected",
  ACCEPTED_REJECT_BLOCKED: "Accepted quote cannot be rejected",
  PAID_REJECT_BLOCKED: "Paid quotes must be cancelled instead of rejected",
  PAYMENT_REQUIRED: "Payment must be completed before accepting quote",
  PAYMENT_NOT_COMPLETED: "Payment not completed",
  SIGNATURE_REQUIRED: "Valid customer signature is required",
  SHIPPER_SIGNATURE_MISSING: "Shipper signature missing",
  FETCHED: "Quotes fetched successfully",
  FETCH_FAILED: "Failed to fetch quotes",
};

module.exports = { customerQuoteResponse };
