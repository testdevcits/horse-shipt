const newsletterResponse = {
  EMAIL_REQUIRED: "Email is required",
  ALREADY_SUBSCRIBED: "Email already subscribed",
  VERIFICATION_SENT: "Verification email sent successfully",
  VERIFIED: "Email verified successfully",
  TOKEN_MISSING: "Token missing",
  INVALID_OR_EXPIRED_TOKEN: "Invalid or expired token",
  TOKEN_EXPIRED: "Token expired",
  SUBSCRIBERS_FETCHED: "Subscribers fetched successfully",
  SUBSCRIBER_NOT_FOUND: "Subscriber not found",
  NO_SUBSCRIBERS_TO_DELETE: "No subscribers found to delete",
  SUBSCRIBER_DELETED: "Subscriber deleted successfully",
  SUBSCRIBER_IDS_REQUIRED: "No subscriber ID(s) provided",
  SUBJECT_REQUIRED: "Subject is required",
  CONTENT_REQUIRED: "Message or HTML content is required",
  RECIPIENTS_REQUIRED: "No recipients provided",
  SEND_FAILED: "Internal server error while sending newsletter",
  SENT: (count) => `Newsletter sent to ${count} subscriber(s)`,
  DELETED_COUNT: (count) => `${count} subscriber(s) deleted successfully`,
};

module.exports = { newsletterResponse };
