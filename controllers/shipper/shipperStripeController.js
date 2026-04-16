// ==========================================================
// IMPORTS
// ==========================================================
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const Shipper = require("../../models/shipper/shipperModel");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const subscriptionModel = require("../../models/shipper/subscriptionModel");

// ==========================================================
// GET PLATFORM COUNTRY
// ==========================================================
const getPlatformCountry = async () => {
  try {
    const account = await stripe.accounts.retrieve();
    return account.country || "US";
  } catch (err) {
    console.error("Stripe Platform Account Error:", err);
    return "US";
  }
};

// ==========================================================
// CREATE STRIPE CONNECT ACCOUNT (EXPRESS)
// ==========================================================
exports.createStripeAccount = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    // Already exists
    if (shipper.stripeAccountId) {
      return res.status(200).json({
        success: true,
        message: "Stripe account already exists",
        stripeAccountId: shipper.stripeAccountId,
      });
    }

    // Get platform country
    const platformCountry = await getPlatformCountry();

    // Allowed countries
    const allowedCountries = ["US", "IN"];

    const accountCountry = allowedCountries.includes(platformCountry)
      ? platformCountry
      : "US";

    // Create express account
    const account = await stripe.accounts.create({
      type: "express",
      country: accountCountry,
      email: shipper.email,

      business_type: "individual",

      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },

      metadata: {
        shipperId: shipper._id.toString(),
      },
    });

    // Save account ID
    shipper.stripeAccountId = account.id;
    shipper.stripeVerified = false;

    await shipper.save();

    res.status(200).json({
      success: true,
      message: "Stripe account created successfully",
      stripeAccountId: account.id,
      accountCountry,
    });
  } catch (error) {
    console.error("Stripe Account Creation Error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ==========================================================
// CREATE STRIPE ONBOARDING LINK
// ==========================================================
exports.createOnboardingLink = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper || !shipper.stripeAccountId) {
      return res.status(400).json({
        success: false,
        message: "Stripe account not created",
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: shipper.stripeAccountId,

      refresh_url:
        "https://horse-shipt-frontend.vercel.app/shipper/dashboard?stripe=refresh",

      return_url:
        "https://horse-shipt-frontend.vercel.app/shipper/dashboard?stripe=success",

      type: "account_onboarding",

      collect: "eventually_due",
    });

    res.json({
      success: true,
      onboardingUrl: accountLink.url,
    });
  } catch (error) {
    console.error("Onboarding Error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ==========================================================
// CHECK STRIPE ACCOUNT STATUS
// ==========================================================
exports.checkStripeStatus = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper || !shipper.stripeAccountId) {
      return res.status(400).json({
        success: false,
        message: "Stripe account not created",
      });
    }

    const account = await stripe.accounts.retrieve(shipper.stripeAccountId);

    shipper.stripeChargesEnabled = account.charges_enabled;
    shipper.stripePayoutsEnabled = account.payouts_enabled;
    shipper.stripeOnboardingCompleted = account.details_submitted;

    shipper.stripeVerified =
      account.details_submitted &&
      account.charges_enabled &&
      account.payouts_enabled;

    await shipper.save();

    res.json({
      success: true,
      verified: shipper.stripeVerified,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      onboardingCompleted: account.details_submitted,
      needsVerification: account.requirements?.currently_due?.length > 0,
      requirements: account.requirements,
    });
  } catch (error) {
    console.error("Stripe Status Error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ==========================================================
// STRIPE WEBHOOK
// ==========================================================
exports.stripeWebhook = async (req, res) => {
  let event;

  try {
    const sig = req.headers["stripe-signature"];

    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook Signature Error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const data = event.data.object;

    console.log("Stripe Event:", event.type);

    switch (event.type) {
      // ================= ACCOUNT UPDATED =================
      case "account.updated": {
        const account = data;

        const shipper = await Shipper.findOne({
          stripeAccountId: account.id,
        });

        if (shipper) {
          shipper.stripeChargesEnabled = account.charges_enabled;
          shipper.stripePayoutsEnabled = account.payouts_enabled;
          shipper.stripeOnboardingCompleted = account.details_submitted;

          shipper.stripeVerified =
            account.details_submitted &&
            account.charges_enabled &&
            account.payouts_enabled;

          await shipper.save();
        }
        break;
      }

      // ================= PAYMENT SUCCESS =================
      case "payment_intent.succeeded": {
        const paymentIntent = data;
        const quoteId = paymentIntent.metadata?.quoteId;

        if (quoteId) {
          await ShipmentQuote.findByIdAndUpdate(quoteId, {
            paymentStatus: "paid",
            paymentCompletedAt: new Date(),
            stripePaymentIntentId: paymentIntent.id,
          });
        }
        break;
      }

      // ================= PAYMENT FAILED =================
      case "payment_intent.payment_failed": {
        const paymentIntent = data;
        const quoteId = paymentIntent.metadata?.quoteId;

        if (quoteId) {
          await ShipmentQuote.findByIdAndUpdate(quoteId, {
            paymentStatus: "failed",
          });
        }
        break;
      }

      // ================= TRANSFER CREATED =================
      case "transfer.created": {
        const transfer = data;
        const quoteId = transfer.metadata?.quoteId;

        if (quoteId) {
          await ShipmentQuote.findByIdAndUpdate(quoteId, {
            transferId: transfer.id,
          });
        }
        break;
      }

      // ================= SUBSCRIPTION CREATED / UPDATED =================
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = data;

        const SubscriptionModel = require("../../models/shipper/subscriptionModel");

        // 🔥 IMPORTANT: customer → user mapping
        const shipper = await Shipper.findOne({
          stripeCustomerId: subscription.customer,
        });

        if (!shipper) {
          console.log("No shipper found for this subscription");
          break;
        }

        let existingSub = await SubscriptionModel.findOne({
          stripeSubscriptionId: subscription.id,
        });

        const currentPeriodStart = subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000)
          : null;

        const currentPeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null;

        const trialStart = subscription.trial_start
          ? new Date(subscription.trial_start * 1000)
          : null;

        const trialEnd = subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null;

        const canceledAt = subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : null;

        if (!existingSub) {
          // ✅ CREATE NEW SUBSCRIPTION
          existingSub = new SubscriptionModel({
            shipperId: shipper._id,
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: subscription.customer,
            status: subscription.status,
            currentPeriodStart,
            currentPeriodEnd,
            trialStart,
            trialEnd,
            canceledAt,
          });
        } else {
          // ✅ UPDATE EXISTING
          existingSub.status = subscription.status;
          existingSub.currentPeriodStart = currentPeriodStart;
          existingSub.currentPeriodEnd = currentPeriodEnd;
          existingSub.trialStart = trialStart;
          existingSub.trialEnd = trialEnd;
          existingSub.canceledAt = canceledAt;
        }

        await existingSub.save();

        // ✅ update shipper status
        shipper.subscriptionStatus = subscription.status;
        await shipper.save();

        break;
      }

      // ================= SUBSCRIPTION DELETED =================
      case "customer.subscription.deleted": {
        const subscription = data;

        const SubscriptionModel = require("../../models/shipper/subscriptionModel");

        const existingSub = await SubscriptionModel.findOne({
          stripeSubscriptionId: subscription.id,
        });

        if (existingSub) {
          existingSub.status = "canceled";
          existingSub.canceledAt = new Date();
          await existingSub.save();
        }

        break;
      }

      // ================= INVOICE PAID =================
      case "invoice.paid": {
        const invoice = data;

        const SubscriptionModel = require("../../models/shipper/subscriptionModel");

        const sub = await SubscriptionModel.findOne({
          stripeSubscriptionId: invoice.subscription,
        });

        if (sub) {
          sub.status = "active";
          sub.lastPaymentDate = new Date();

          const periodEnd = invoice.lines?.data?.[0]?.period?.end;

          if (periodEnd) {
            sub.nextBillingDate = new Date(periodEnd * 1000);
          }

          await sub.save();
        }

        break;
      }

      // ================= INVOICE FAILED =================
      case "invoice.payment_failed": {
        const invoice = data;

        const SubscriptionModel = require("../../models/shipper/subscriptionModel");

        const sub = await SubscriptionModel.findOne({
          stripeSubscriptionId: invoice.subscription,
        });

        if (sub) {
          sub.status = "past_due";
          await sub.save();

          const shipper = await Shipper.findById(sub.shipperId);

          if (shipper) {
            shipper.accountStatus = "RESTRICTED";
            await shipper.save();
          }
        }

        break;
      }

      default:
        console.log(`Unhandled event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook Processing Error:", error);

    res.status(500).json({
      success: false,
      error: "Webhook processing failed",
    });
  }
};

// ==========================================================
// CREATE STRIPE CUSTOMER (FOR SHIPPER CARD STORAGE)
// ==========================================================
exports.createStripeCustomer = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    // Already exists
    if (shipper.stripeCustomerId) {
      return res.json({
        success: true,
        message: "Customer already exists",
        stripeCustomerId: shipper.stripeCustomerId,
      });
    }

    const customer = await stripe.customers.create({
      email: shipper.email,
      name: shipper.name,
      metadata: {
        shipperId: shipper._id.toString(),
      },
    });

    shipper.stripeCustomerId = customer.id;
    await shipper.save();

    console.log("Stripe customer created:", customer.id);

    res.json({
      success: true,
      stripeCustomerId: customer.id,
    });
  } catch (error) {
    console.error("Create Customer Error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ==========================================================
// CREATE SETUP INTENT (ADD CARD)
// ==========================================================
exports.createSetupIntent = async (req, res) => {
  try {
    const shipper = req.user;

    // ---------------- CHECK SHIPPER ----------------
    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    // ---------------- ENSURE STRIPE CUSTOMER ----------------
    let stripeCustomerId = shipper.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: shipper.email,
        name: shipper.name,
      });

      stripeCustomerId = customer.id;

      // save to DB
      shipper.stripeCustomerId = stripeCustomerId;
      await shipper.save();
    }

    // ---------------- CREATE SETUP INTENT ----------------
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
    });

    console.log("SetupIntent created:", setupIntent.id);

    return res.json({
      success: true,
      clientSecret: setupIntent.client_secret,
    });
  } catch (error) {
    console.error("SetupIntent Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create SetupIntent",
      error: error.message,
    });
  }
};

// ==========================================================
// SAVE PAYMENT METHOD
// ==========================================================
exports.savePaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId } = req.body;

    const shipper = await Shipper.findById(req.user.id);

    if (!shipper || !shipper.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: "Stripe customer not found",
      });
    }

    console.log("[CARD UPDATE] Start", {
      shipperId: shipper._id,
      paymentMethodId,
    });

    // Attach payment method
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: shipper.stripeCustomerId,
    });

    // Set default
    await stripe.customers.update(shipper.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Get card details
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    // Save card info
    shipper.paymentMethodId = paymentMethodId;
    shipper.cardLast4 = paymentMethod.card.last4;
    shipper.cardBrand = paymentMethod.card.brand;
    shipper.cardExpMonth = paymentMethod.card.exp_month;
    shipper.cardExpYear = paymentMethod.card.exp_year;

    if (shipper.accountStatus === "RESTRICTED") {
      console.log("[ACCOUNT] Removing restriction after card update");

      shipper.accountStatus = "ACTIVE";
      shipper.lastPaymentFailure = null;
      shipper.paymentFailureReason = null;
    }

    await shipper.save();

    console.log(
      "[SUCCESS] Card saved & account status:",
      shipper.accountStatus
    );

    res.json({
      success: true,
      message:
        "Card saved successfully. Account activated if previously restricted.",
    });
  } catch (error) {
    console.error("[SAVE PAYMENT ERROR]", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ==========================================================
// CHECK PAYMENT STATUS
// ==========================================================
exports.getPaymentStatus = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);

    res.json({
      success: true,
      hasCard: !!shipper.paymentMethodId,
      cardLast4: shipper.cardLast4 || null,
      cardBrand: shipper.cardBrand || null,
    });
  } catch (error) {
    console.error("Payment Status Error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.createSubscription = async (req, res) => {
  console.log("=== CREATE SUBSCRIPTION (FIXED TRIAL LOGIC) ===");

  try {
    const { withTrial = true } = req.body;
    const DAILY_PRICE_ID = process.env.STRIPE_DAILY_PRICE_ID;

    if (!DAILY_PRICE_ID) {
      return res.status(400).json({
        success: false,
        message: "Daily price ID not configured",
      });
    }

    // ============================
    // FETCH SHIPPER
    // ============================
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    if (!shipper.stripeCustomerId || !shipper.paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: "Customer or payment method not found",
      });
    }

    // ============================
    // PREVENT DUPLICATE (DB CHECK)
    // ============================
    const existingSub = await subscriptionModel.findOne({
      shipperId: shipper._id,
      status: { $in: ["active", "trialing"] },
    });

    if (existingSub) {
      return res.status(400).json({
        success: false,
        message: "Subscription already exists",
      });
    }

    // ============================
    // STRIPE CHECK (ACTIVE SUB)
    // ============================
    const stripeSubs = await stripe.subscriptions.list({
      customer: shipper.stripeCustomerId,
      limit: 10,
    });

    const activeSub = stripeSubs.data.find((sub) =>
      ["active", "trialing"].includes(sub.status)
    );

    if (activeSub) {
      return res.status(400).json({
        success: false,
        message: "Subscription already exists (Stripe)",
      });
    }

    // ============================
    // CHECK TRIAL HISTORY (IMPORTANT FIX)
    // ============================
    const allSubs = await stripe.subscriptions.list({
      customer: shipper.stripeCustomerId,
      status: "all",
      limit: 100,
    });

    const hasUsedTrialBefore = allSubs.data.some(
      (sub) => sub.trial_start !== null
    );

    // ============================
    // BUILD SUBSCRIPTION DATA
    // ============================
    const subscriptionData = {
      customer: shipper.stripeCustomerId,
      items: [{ price: DAILY_PRICE_ID }],
      default_payment_method: shipper.paymentMethodId,
      expand: ["items.data.price"],

      cancel_at_period_end: false,

      metadata: {
        shipperId: shipper._id.toString(),
        email: shipper.email,
        plan: "daily",
      },
    };

    // ============================
    // TRIAL LOGIC (FIXED)
    // ============================
    const TRIAL_DAYS = 1;

    if (withTrial && !hasUsedTrialBefore) {
      subscriptionData.trial_period_days = TRIAL_DAYS;
      console.log("Trial Applied (First Time Only)");
    } else {
      console.log("No Trial - already used before");
    }

    // ============================
    // CREATE SUBSCRIPTION
    // ============================
    const subscription = await stripe.subscriptions.create(subscriptionData, {
      idempotencyKey: `sub_${shipper._id}`, // prevent duplicate calls
    });

    const price = subscription.items.data[0].price;

    // ============================
    // DATE HANDLING
    // ============================
    const currentPeriodStart = subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000).toISOString()
      : subscription.trial_start
      ? new Date(subscription.trial_start * 1000).toISOString()
      : null;

    const currentPeriodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null;

    const trialStart = subscription.trial_start
      ? new Date(subscription.trial_start * 1000).toISOString()
      : null;

    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null;

    // ============================
    // SAVE IN DB
    // ============================
    const newSubscription = await subscriptionModel.create({
      shipperId: shipper._id,

      stripeCustomerId: shipper.stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: price.id,

      planName: "Shipper Daily Plan",

      amount: price.unit_amount / 100,
      currency: price.currency,
      interval: "day",

      status: subscription.status,

      trialStart,
      trialEnd,

      currentPeriodStart,
      currentPeriodEnd,

      cancelAtPeriodEnd: false,
    });

    // ============================
    // MARK TRIAL USED (EXTRA SAFETY)
    // ============================
    if (subscription.trial_start || subscription.trial_end) {
      shipper.hasUsedTrial = true;
      await shipper.save();
    }

    // ============================
    // RESPONSE
    // ============================
    return res.json({
      success: true,
      message: "Subscription created successfully",
      data: {
        subscriptionId: newSubscription._id,
        stripeSubscriptionId: subscription.id,
        status: newSubscription.status,

        trialStart,
        trialEnd,
        currentPeriodStart,
        currentPeriodEnd,
      },
    });
  } catch (error) {
    console.error("SUBSCRIPTION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =========================================================
// CANCEL SUBSCRIPTION
// =========================================================

exports.cancelSubscription = async (req, res) => {
  console.log("=== CANCEL SUBSCRIPTION API HIT (NO REFUND) ===");

  try {
    const { reason = "User requested" } = req.body;

    const shipper = await Shipper.findById(req.user.id);

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    const subscription = await subscriptionModel.findOne({
      shipperId: shipper._id,
      status: { $in: ["active", "trialing", "past_due"] },
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "No active subscription found",
      });
    }

    const stripeSub = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    // ============================
    // IF ALREADY CANCELED
    // ============================
    if (stripeSub.status === "canceled") {
      const canceledAt = stripeSub.canceled_at
        ? new Date(stripeSub.canceled_at * 1000).toISOString()
        : new Date().toISOString();

      subscription.status = "canceled";
      subscription.cancelAtPeriodEnd = false;
      subscription.canceledAt = canceledAt;

      await subscription.save();

      return res.json({
        success: true,
        message: "Subscription already canceled",
        data: {
          status: subscription.status,
          canceledAt,
        },
      });
    }

    const isTrial = stripeSub.status === "trialing";
    const isPastDue = stripeSub.status === "past_due";

    let updatedStripeSub;

    // ============================
    // 1. TRIAL → IMMEDIATE CANCEL
    // ============================
    if (isTrial) {
      console.log("Canceling trial immediately");

      updatedStripeSub = await stripe.subscriptions.del(
        subscription.stripeSubscriptionId
      );

      subscription.status = "canceled";
      subscription.cancelAtPeriodEnd = false;
    }

    // ============================
    // 2. PAST_DUE → IMMEDIATE CANCEL
    // ============================
    else if (isPastDue) {
      console.log("Past due → immediate cancel");

      updatedStripeSub = await stripe.subscriptions.del(
        subscription.stripeSubscriptionId
      );

      subscription.status = "canceled";
      subscription.cancelAtPeriodEnd = false;
    }

    // ============================
    // 3. ACTIVE → CANCEL AT PERIOD END
    // ============================
    else {
      console.log("Active subscription → cancel at period end");

      updatedStripeSub = await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        }
      );

      subscription.status = updatedStripeSub.status; // fix
      subscription.cancelAtPeriodEnd = true;
    }

    // ============================
    // DATES HANDLING
    // ============================
    let canceledAt = new Date().toISOString();
    let accessValidTill = null;

    if (updatedStripeSub?.canceled_at) {
      canceledAt = new Date(updatedStripeSub.canceled_at * 1000).toISOString();
    }

    if (updatedStripeSub?.current_period_end) {
      accessValidTill = new Date(
        updatedStripeSub.current_period_end * 1000
      ).toISOString();
    }

    // ============================
    // SAVE IN DB
    // ============================
    subscription.canceledAt = canceledAt;
    subscription.cancelReason = reason;
    subscription.currentPeriodEnd =
      accessValidTill || subscription.currentPeriodEnd;

    await subscription.save();

    // ============================
    // RESPONSE
    // ============================
    return res.json({
      success: true,
      message: isTrial
        ? "Trial canceled immediately"
        : isPastDue
        ? "Subscription canceled due to payment failure"
        : "Subscription canceled. Access valid till billing period end",

      data: {
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt,
        accessValidTill,
        isTrial,
      },
    });
  } catch (error) {
    console.error("CANCEL SUBSCRIPTION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET PLAN DETAILS

// ============================
// HELPERS (TOP pe add kar)
// ============================
const formatToUSDateTime = (timestamp) => {
  if (!timestamp) return null;

  return new Date(timestamp * 1000).toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const toISO = (timestamp) => {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toISOString();
};

// ============================
// UPDATED FUNCTION
// ============================
exports.getSubscriptionPlan = async (req, res) => {
  try {
    console.log("========== GET SUBSCRIPTION PLAN + NEXT BILLING ==========");

    const DAILY_PRICE_ID = process.env.STRIPE_DAILY_PRICE_ID;

    if (!DAILY_PRICE_ID) {
      return res.status(500).json({
        success: false,
        message: "Daily price ID not configured",
      });
    }

    // ============================
    // GET USER
    // ============================
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper || !shipper.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: "Shipper or Stripe customer not found",
      });
    }

    // ============================
    // FETCH PRICE
    // ============================
    const price = await stripe.prices.retrieve(DAILY_PRICE_ID, {
      expand: ["product"],
    });

    const daily = {
      priceId: price.id,
      amount: price.unit_amount / 100,
      currency: price.currency,
      interval: price.recurring?.interval || "day",
      productName: price.product?.name || "Subscription",
      label: "Daily Plan",
      planType: "daily",
    };

    // ============================
    // DEFAULT VALUES
    // ============================
    let nextBillingDate = null;
    let subscriptionStatus = null;
    let cancelAtPeriodEnd = false;
    let subscriptionEndDate = null;

    // ============================
    // GET SUB FROM DB
    // ============================
    const dbSub = await subscriptionModel.findOne({
      shipperId: shipper._id,
      status: { $in: ["active", "trialing", "past_due"] },
    });

    if (dbSub) {
      const sub = await stripe.subscriptions.retrieve(
        dbSub.stripeSubscriptionId
      );

      console.log("Stripe Sub Debug:", {
        status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end,
        current_period_end: sub.current_period_end,
        trial_end: sub.trial_end,
      });

      subscriptionStatus = sub.status;
      cancelAtPeriodEnd = sub.cancel_at_period_end;

      // ============================
      // NEXT BILLING DATE
      // ============================
      const rawNext = sub.current_period_end || sub.trial_end || null;

      if (rawNext) {
        nextBillingDate = {
          iso: toISO(rawNext),
          us: formatToUSDateTime(rawNext),
        };
      }

      // ============================
      // END DATE (CANCELLED CASE)
      // ============================
      if (sub.cancel_at_period_end) {
        const rawEnd = sub.current_period_end || dbSub?.currentPeriodEnd;

        if (rawEnd) {
          subscriptionEndDate = {
            iso:
              typeof rawEnd === "number"
                ? toISO(rawEnd)
                : new Date(rawEnd).toISOString(),
            us:
              typeof rawEnd === "number"
                ? formatToUSDateTime(rawEnd)
                : new Date(rawEnd).toLocaleString("en-US", {
                    timeZone: "America/New_York",
                  }),
          };
        }
      }

      // ============================
      // FULLY CANCELED
      // ============================
      if (sub.status === "canceled" && sub.canceled_at) {
        subscriptionEndDate = {
          iso: toISO(sub.canceled_at),
          us: formatToUSDateTime(sub.canceled_at),
        };
      }
    }

    // ============================
    // RESPONSE
    // ============================
    return res.json({
      success: true,
      data: {
        daily,
        trialDays: 1,
        currency: daily.currency,

        subscriptionStatus,
        nextBillingDate,

        cancelAtPeriodEnd,
        subscriptionEndDate,
      },
    });
  } catch (error) {
    console.error("Subscription Plan Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET CURRENT SHIPPER SUBSCRIPTION
exports.getShipperSubscriptionStatus = async (req, res) => {
  try {
    console.log("=== getShipperSubscriptionStatus (DAILY ONLY) ===");

    const shipper = await Shipper.findById(req.user.id);

    if (!shipper || !shipper.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: "Shipper not found or Stripe customer missing",
      });
    }

    // =======================
    // FETCH ALL SUBSCRIPTIONS
    // =======================
    const subscriptions = await stripe.subscriptions.list({
      customer: shipper.stripeCustomerId,
      limit: 5,
      expand: ["data.items.data.price"],
    });

    let currentSub = subscriptions.data.find((sub) =>
      ["trialing", "active", "past_due"].includes(sub.status)
    );

    if (!currentSub && subscriptions.data.length > 0) {
      currentSub = subscriptions.data[0]; // latest
    }

    if (!currentSub) {
      return res.json({
        success: true,
        hasSubscription: false,
        status: "none",
        message: "No subscription found",

        hasAccess: false,
        needsSubscription: true,
      });
    }

    const price = currentSub.items?.data?.[0]?.price || {};

    const currentPeriodStart = currentSub.current_period_start
      ? new Date(currentSub.current_period_start * 1000).toISOString()
      : currentSub.trial_start
      ? new Date(currentSub.trial_start * 1000).toISOString()
      : null;

    const currentPeriodEnd = currentSub.current_period_end
      ? new Date(currentSub.current_period_end * 1000).toISOString()
      : currentSub.trial_end
      ? new Date(currentSub.trial_end * 1000).toISOString()
      : null;

    const trialEnd = currentSub.trial_end
      ? new Date(currentSub.trial_end * 1000).toISOString()
      : null;

    const canceledAt = currentSub.canceled_at
      ? new Date(currentSub.canceled_at * 1000).toISOString()
      : null;

    // =======================
    // TRIAL CALCULATION
    // =======================
    let remainingTrialDays = 0;
    let trialActive = false;

    if (currentSub.status === "trialing" && currentSub.trial_end) {
      const now = Math.floor(Date.now() / 1000);

      remainingTrialDays = Math.max(
        0,
        Math.ceil((currentSub.trial_end - now) / (60 * 60 * 24))
      );

      trialActive = remainingTrialDays > 0;
    }

    // =======================
    // ACCESS CONTROL
    // =======================
    const hasAccess =
      currentSub.status === "active" || currentSub.status === "trialing";

    const isCanceled =
      currentSub.status === "canceled" || currentSub.cancel_at_period_end;

    const isExpired =
      currentSub.status === "canceled" &&
      currentSub.ended_at &&
      currentSub.ended_at < Math.floor(Date.now() / 1000);

    // =======================
    // SYNC DATABASE
    // =======================
    await subscriptionModel.findOneAndUpdate(
      { stripeSubscriptionId: currentSub.id },
      {
        shipperId: shipper._id,
        stripeCustomerId: shipper.stripeCustomerId,
        stripeSubscriptionId: currentSub.id,
        stripePriceId: price.id,

        planName: "Shipper Daily Plan",

        amount: price?.unit_amount / 100 || 0,
        currency: price?.currency,
        interval: "day",

        status: currentSub.status,

        trialStart: currentSub.trial_start
          ? new Date(currentSub.trial_start * 1000).toISOString()
          : null,

        trialEnd,

        currentPeriodStart,
        currentPeriodEnd,

        cancelAtPeriodEnd: currentSub.cancel_at_period_end,
        canceledAt,
      },
      { upsert: true, new: true }
    );

    // =======================
    // RESPONSE
    // =======================
    return res.json({
      success: true,

      hasSubscription: true,
      status: currentSub.status,
      planType: "daily",

      hasAccess,

      trialActive,
      remainingTrialDays,

      trialEnd,
      currentPeriodStart,
      currentPeriodEnd,

      cancelAtPeriodEnd: currentSub.cancel_at_period_end,
      canceledAt,

      isTrialing: currentSub.status === "trialing",
      isActive: currentSub.status === "active",
      isPastDue: currentSub.status === "past_due",

      isCanceled,
      isExpired,

      needsRenewal: currentSub.status === "past_due" || isExpired,

      needsSubscription: !hasAccess,
    });
  } catch (error) {
    console.error("Get Subscription Status Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getBillingHistory = async (req, res) => {
  try {
    console.log("=== GET BILLING HISTORY (SEPARATED) ===");

    const shipper = await Shipper.findById(req.user.id);

    if (!shipper || !shipper.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: "Shipper or Stripe customer not found",
      });
    }

    // ============================
    // PARALLEL CALLS ⚡
    // ============================
    const [invoices, charges, payouts] = await Promise.all([
      stripe.invoices.list({
        customer: shipper.stripeCustomerId,
        limit: 20,
      }),

      stripe.charges.list({
        customer: shipper.stripeCustomerId,
        limit: 20,
      }),

      // ⚠️ payouts require Stripe Connect (account based)
      stripe.payouts.list({
        limit: 20,
      }),
    ]);

    // ============================
    // FORMAT INVOICES (SUBSCRIPTION)
    // ============================
    const subscriptionData = invoices.data.map((inv) => ({
      id: inv.id,
      amount: inv.amount_paid / 100,
      currency: inv.currency,

      status: inv.status,
      billingReason: inv.billing_reason,

      createdAt: new Date(inv.created * 1000),
      periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
      periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : null,

      paid: inv.paid,
      paidAt: inv.status_transitions?.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000)
        : null,

      invoicePdf: inv.invoice_pdf,
      hostedInvoiceUrl: inv.hosted_invoice_url,
    }));

    // ============================
    // FORMAT CHARGES (PAYMENTS)
    // ============================
    const paymentData = charges.data.map((ch) => ({
      id: ch.id,
      amount: ch.amount / 100,
      currency: ch.currency,

      status: ch.status,
      paid: ch.paid,
      refunded: ch.refunded,

      createdAt: new Date(ch.created * 1000),

      receiptUrl: ch.receipt_url,

      paymentMethod: ch.payment_method_details?.type,
      cardBrand: ch.payment_method_details?.card?.brand,
      last4: ch.payment_method_details?.card?.last4,
    }));

    // ============================
    // FORMAT PAYOUTS (BANK TRANSFER)
    // ============================
    const payoutData = payouts.data.map((po) => ({
      id: po.id,
      amount: po.amount / 100,
      currency: po.currency,

      status: po.status, // paid, pending, failed

      arrivalDate: new Date(po.arrival_date * 1000),
      createdAt: new Date(po.created * 1000),

      method: po.method, // standard / instant
    }));

    // ============================
    // RESPONSE (SEPARATED)
    // ============================
    return res.json({
      success: true,

      data: {
        subscriptions: subscriptionData,
        payments: paymentData,
        payouts: payoutData,
      },
    });
  } catch (error) {
    console.error("Billing History Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
