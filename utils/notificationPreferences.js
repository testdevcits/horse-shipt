const CustomerNotification = require("../models/customer/CustomerNotificationModel");
const ShipperSettings = require("../models/shipper/shipperSettingsModel");

const CUSTOMER_TYPE_MAP = {
  quote_created: "newQuote",
  quote_accepted: "offerInteraction",
  quote_cancelled: "offerInteraction",
  quote_rejected: "offerInteraction",
  vehicle_assigned: "shipmentUpdates",
  shipment_message: "newMessage",
  chat_message: "newMessage",
  question: "question",
  shipment_question: "question",
  review: "newReview",
  shipment_update: "shipmentUpdates",
  upcoming_shipment: "upcomingShipment",
};

const SHIPPER_TYPE_MAP = {
  quote_created: "quote",
  quote_accepted: "quote",
  quote_cancelled: "quote",
  quote_rejected: "quote",
  shipment_invitation: "opportunity",
  opportunity: "opportunity",
  shipment_message: "message",
  chat_message: "message",
  question: "question",
  shipment_question: "question",
  review: "review",
  vehicle_assigned: "shipment",
  shipment_update: "shipment",
  upcoming_shipment: "shipment",
};

const getCustomerSettingKey = (type = "") =>
  CUSTOMER_TYPE_MAP[type] || CUSTOMER_TYPE_MAP[type.replace(/^horse_shipt:/, "")] || type;

const getShipperSettingKey = (type = "") =>
  SHIPPER_TYPE_MAP[type] || SHIPPER_TYPE_MAP[type.replace(/^horse_shipt:/, "")] || type;

const getCustomerNotificationSettings = async (customerId) => {
  if (!customerId) return null;
  return (
    (await CustomerNotification.findOne({ user: customerId })) ||
    (await CustomerNotification.create({ user: customerId }))
  );
};

const getShipperNotificationSettings = async (shipperId) => {
  if (!shipperId) return null;
  return (
    (await ShipperSettings.findOne({ shipperId })) ||
    (await ShipperSettings.create({ shipperId }))
  );
};

const isCustomerNotificationEnabled = async (customerId, type) => {
  const settings = await getCustomerNotificationSettings(customerId);
  const key = getCustomerSettingKey(type);
  return settings?.settings?.[key] !== false;
};

const getShipperChannelSettings = async (shipperId, type) => {
  const settings = await getShipperNotificationSettings(shipperId);
  const key = getShipperSettingKey(type);
  return settings?.notifications?.[key] || { email: true, sms: true };
};

const isShipperNotificationEnabled = async (shipperId, type) => {
  const channels = await getShipperChannelSettings(shipperId, type);
  return channels.email !== false || channels.sms !== false;
};

const isInAppNotificationEnabled = async ({ role, userId, type }) => {
  if (role === "customer") return isCustomerNotificationEnabled(userId, type);
  if (role === "shipper") return isShipperNotificationEnabled(userId, type);
  return true;
};

module.exports = {
  getCustomerSettingKey,
  getShipperSettingKey,
  getCustomerNotificationSettings,
  getShipperNotificationSettings,
  isCustomerNotificationEnabled,
  getShipperChannelSettings,
  isShipperNotificationEnabled,
  isInAppNotificationEnabled,
};
