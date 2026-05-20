// ==========================================================
// IMPORTS
// ==========================================================
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const Shipper = require("../../models/shipper/shipperModel");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const subscriptionModel = require("../../models/shipper/subscriptionModel");

const {
  sendSubscriptionEmail,
} = require("../../utils/subscriptionEmailService");

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

    const SubscriptionModel = require("../../models/shipper/subscriptionModel");

    switch (event.type) {
      // ================= ACCOUNT UPDATED =================
      case "account.updated": {
        const shipper = await Shipper.findOne({
          stripeAccountId: data.id,
        });

        if (shipper) {
          shipper.stripeChargesEnabled = data.charges_enabled;
          shipper.stripePayoutsEnabled = data.payouts_enabled;
          shipper.stripeOnboardingCompleted = data.details_submitted;

          shipper.stripeVerified =
            data.details_submitted &&
            data.charges_enabled &&
            data.payouts_enabled;

          await shipper.save();
        }
        break;
      }

      // ================= PAYMENT SUCCESS =================
      case "payment_intent.succeeded": {
        const quoteId = data.metadata?.quoteId;

        if (quoteId) {
          await ShipmentQuote.findByIdAndUpdate(quoteId, {
            paymentStatus: "paid",
            paymentCompletedAt: new Date(),
            stripePaymentIntentId: data.id,
          });
        }
        break;
      }

      // ================= PAYMENT FAILED =================
      case "payment_intent.payment_failed": {
        const quoteId = data.metadata?.quoteId;

        if (quoteId) {
          await ShipmentQuote.findByIdAndUpdate(quoteId, {
            paymentStatus: "failed",
          });
        }
        break;
      }

      // ================= TRANSFER CREATED =================
      case "transfer.created": {
        const quoteId = data.metadata?.quoteId;

        if (quoteId) {
          await ShipmentQuote.findByIdAndUpdate(quoteId, {
            transferId: data.id,
          });
        }
        break;
      }

      // ================= SUBSCRIPTION CREATE / UPDATE =================
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = data;

        const shipper = await Shipper.findOne({
          stripeCustomerId: subscription.customer,
        });

        if (!shipper) {
          break;
        }

        const price = subscription.items?.data?.[0]?.price || {};

        const updateData = {
          shipperId: shipper._id,
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: subscription.customer,
          stripePriceId: price.id,

          planName: "Shipper Monthly Plan",
          interval: "month",

          amount: price?.unit_amount / 100 || 0,
          currency: price?.currency,

          status: subscription.status,

          currentPeriodStart: subscription.current_period_start
            ? new Date(subscription.current_period_start * 1000)
            : null,

          currentPeriodEnd: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : null,

          trialStart: subscription.trial_start
            ? new Date(subscription.trial_start * 1000)
            : null,

          trialEnd: subscription.trial_end
            ? new Date(subscription.trial_end * 1000)
            : null,

          canceledAt: subscription.canceled_at
            ? new Date(subscription.canceled_at * 1000)
            : null,

          cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        };

        await SubscriptionModel.findOneAndUpdate(
          { stripeSubscriptionId: subscription.id },
          updateData,
          { upsert: true, new: true }
        );

        // update shipper
        shipper.subscriptionStatus = subscription.status;

        // mark trial used
        if (subscription.trial_start || subscription.trial_end) {
          shipper.hasUsedTrial = true;
        }

        await shipper.save();

        break;
      }

      // ================= SUBSCRIPTION DELETED =================
      case "customer.subscription.deleted": {
        const subscription = data;

        await SubscriptionModel.findOneAndUpdate(
          { stripeSubscriptionId: subscription.id },
          {
            status: "canceled",
            canceledAt: new Date(),
            cancelAtPeriodEnd: false,
          }
        );

        break;
      }

      // ================= INVOICE PAID =================
      case "invoice.paid": {
        const invoice = data;

        const sub = await SubscriptionModel.findOne({
          stripeSubscriptionId: invoice.subscription,
        });

        if (sub) {
          sub.status = "active";
          sub.lastPaymentDate = new Date();

          const periodEnd = invoice.lines?.data?.[0]?.period?.end;

          if (periodEnd) {
            sub.nextBillingDate = new Date(periodEnd * 1000);
            sub.currentPeriodEnd = new Date(periodEnd * 1000);
          }

          await sub.save();
        }

        break;
      }

      // ================= INVOICE FAILED =================
      case "invoice.payment_failed": {
        const invoice = data;

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
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("Webhook Processing Error:", error);

    return res.status(500).json({
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

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (
      paymentMethod.customer &&
      paymentMethod.customer !== shipper.stripeCustomerId
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment method belongs to another Stripe customer",
      });
    }

    if (!paymentMethod.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: shipper.stripeCustomerId,
      });
    }

    // Set default
    await stripe.customers.update(shipper.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Save card info
    shipper.paymentMethodId = paymentMethodId;
    shipper.cardLast4 = paymentMethod.card.last4;
    shipper.cardBrand = paymentMethod.card.brand;
    shipper.cardExpMonth = paymentMethod.card.exp_month;
    shipper.cardExpYear = paymentMethod.card.exp_year;

    if (shipper.accountStatus === "RESTRICTED") {

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
      cardBrand: shipper.cardBrand,
      cardLast4: shipper.cardLast4,
      cardExpMonth: shipper.cardExpMonth,
      cardExpYear: shipper.cardExpYear,
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
  try {
    const { withTrial = true } = req.body;

    const MONTHLY_PRICE_ID = process.env.STRIPE_MONTHLY_PRICE_ID;

    if (!MONTHLY_PRICE_ID) {
      return res.status(400).json({
        success: false,
        message: "Monthly price ID not configured",
      });
    }

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
    // CHECK STRIPE SUBSCRIPTIONS
    // ============================
    const stripeSubs = await stripe.subscriptions.list({
      customer: shipper.stripeCustomerId,
      limit: 10,
    });

    const nowTs = Math.floor(Date.now() / 1000);

    const activeSub = stripeSubs.data.find((sub) => {
      const validStatus = ["active", "trialing", "past_due"].includes(
        sub.status
      );
      const validTime =
        sub.current_period_end && sub.current_period_end > nowTs;
      return validStatus && validTime;
    });

    if (activeSub) {
      return res.status(400).json({
        success: false,
        message: "Subscription already exists or is active",
      });
    }

    // ============================
    // CLEAN OLD DB RECORDS
    // ============================
    await subscriptionModel.updateMany(
      {
        shipperId: shipper._id,
        status: { $in: ["active", "trialing"] },
      },
      {
        status: "canceled",
        cancelAtPeriodEnd: false,
      }
    );

    // ============================
    // CHECK TRIAL HISTORY
    // ============================
    const priorTrialSubscription = await subscriptionModel.findOne({
      shipperId: shipper._id,
      $or: [{ trialStart: { $ne: null } }, { trialEnd: { $ne: null } }],
    });

    const hasUsedTrialBefore =
      shipper.hasUsedTrial || Boolean(priorTrialSubscription);

    // ============================
    // CREATE STRIPE SUBSCRIPTION
    // ============================
    const subscriptionData = {
      customer: shipper.stripeCustomerId,
      items: [{ price: MONTHLY_PRICE_ID }],
      default_payment_method: shipper.paymentMethodId,
      metadata: {
        shipperId: shipper._id.toString(),
        email: shipper.email,
        plan: "monthly",
      },
    };

    const TRIAL_DAYS = 30;

    if (withTrial && !hasUsedTrialBefore) {
      subscriptionData.trial_period_days = TRIAL_DAYS;
    }

    const subscription = await stripe.subscriptions.create(subscriptionData, {
      idempotencyKey: `sub_${shipper._id}`,
    });

    const price = subscription.items.data[0].price;

    // ============================
    // DATES
    // ============================
    const trialStart = subscription.trial_start
      ? new Date(subscription.trial_start * 1000).toISOString()
      : null;

    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null;

    const currentPeriodStart = subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000).toISOString()
      : trialStart;

    const currentPeriodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : trialEnd;

    // ============================
    // SAVE DB
    // ============================
    const newSubscription = await subscriptionModel.create({
      shipperId: shipper._id,
      stripeCustomerId: shipper.stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: price.id,
      planName: "Shipper Monthly Plan",
      amount: price.unit_amount / 100,
      currency: price.currency,
      interval: "month",
      status: subscription.status,
      trialStart,
      trialEnd,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
    });

    // ============================
    // MARK TRIAL USED
    // ============================
    if (subscription.trial_start || subscription.trial_end) {
      shipper.hasUsedTrial = true;
      await shipper.save();
    }

    // ============================
    // SEND EMAIL (IMPORTANT FIX)
    // ============================
    await sendSubscriptionEmail({
      shipperId: shipper._id,
      planName: "Shipper Monthly Plan",
      amount: price.unit_amount / 100,
      trialEnd,
    });

    // ============================
    // RESPONSE
    // ============================
    return res.json({
      success: true,
      message: "Monthly subscription created successfully",
      data: {
        subscriptionId: newSubscription._id,
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
        plan: "monthly",
        trialStart,
        trialEnd,
        currentPeriodStart,
        currentPeriodEnd,
        trialApplied: !!subscription.trial_start,
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
      interval: "month",
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

    if (!stripeSub) {
      return res.status(404).json({
        success: false,
        message: "Stripe subscription not found",
      });
    }

    // ============================
    // CASE 1: TRIAL PERIOD
    // Business rule: trial subscriptions cannot be canceled manually.
    // ============================
    if (stripeSub.status === "trialing") {
      return res.status(400).json({
        success: false,
        code: "TRIAL_CANCELLATION_NOT_ALLOWED",
        message:
          "You are currently in the free trial period. Cancellation is not available until the trial ends.",
        data: {
          plan: "monthly",
          status: "trialing",
          trialEnd: stripeSub.trial_end
            ? new Date(stripeSub.trial_end * 1000).toISOString()
            : subscription.trialEnd,
          cancelAllowed: false,
        },
      });
    }

    // ============================
    // CASE 2: ALREADY CANCELED
    // ============================
    if (stripeSub.status === "canceled") {
      return res.json({
        success: true,
        message: "Subscription already canceled",
        data: {
          status: "canceled",
        },
      });
    }

    // ============================
    // CASE 3: ACTIVE / PAST DUE SUBSCRIPTION
    // ============================
    const updatedStripeSub = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      }
    );

    subscription.status = updatedStripeSub.status;
    subscription.cancelAtPeriodEnd = true;
    subscription.canceledAt = new Date().toISOString();
    subscription.cancelReason = reason;

    await subscription.save();

    return res.json({
      success: true,
      message: "Subscription will be canceled at the end of billing cycle",

      data: {
        plan: "monthly",
        status: subscription.status,
        cancelAtPeriodEnd: true,
        accessValidTill: subscription.currentPeriodEnd,
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
    const MONTHLY_PRICE_ID = process.env.STRIPE_MONTHLY_PRICE_ID;

    if (!MONTHLY_PRICE_ID) {
      return res.status(500).json({
        success: false,
        message: "Monthly price ID not configured",
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
    const price = await stripe.prices.retrieve(MONTHLY_PRICE_ID, {
      expand: ["product"],
    });

    const monthly = {
      priceId: price.id,
      amount: price.unit_amount / 100,
      currency: price.currency,
      interval: price.recurring?.interval || "month",
      productName: price.product?.name || "Subscription",
      label: "Monthly Plan",
      planType: "monthly",
    };

    // ============================
    // TRIAL CHECK (FIXED)
    // ============================
    const priorTrialSubscription = await subscriptionModel
      .findOne({
        shipperId: shipper._id,
        $or: [{ trialStart: { $ne: null } }, { trialEnd: { $ne: null } }],
      })
      .lean();

    const hasUsedTrial =
      shipper.hasUsedTrial === true || Boolean(priorTrialSubscription);

    const TRIAL_DAYS = 30;
    let trialDays = hasUsedTrial ? 0 : TRIAL_DAYS;

    // ============================
    // DEFAULT VALUES
    // ============================
    let nextBillingDate = null;
    let subscriptionStatus = null;
    let cancelAtPeriodEnd = false;
    let subscriptionEndDate = null;
    let trialActive = false;
    let remainingTrialDays = 0;
    let trialEndDate = null;

    // ============================
    // GET ACTIVE SUBSCRIPTION
    // ============================
    const dbSub = await subscriptionModel.findOne({
      shipperId: shipper._id,
      interval: "month",
      status: { $in: ["active", "trialing", "past_due"] },
    });

    if (dbSub?.stripeSubscriptionId) {
      const sub = await stripe.subscriptions.retrieve(
        dbSub.stripeSubscriptionId,
        { expand: ["items.data.price"] }
      );

      subscriptionStatus = sub.status;
      cancelAtPeriodEnd = sub.cancel_at_period_end || false;

      if (sub.status === "trialing" && sub.trial_end) {
        const nowTs = Math.floor(Date.now() / 1000);
        remainingTrialDays = Math.max(
          Math.ceil((sub.trial_end - nowTs) / (60 * 60 * 24)),
          0
        );
        trialActive = remainingTrialDays > 0;
        trialDays = remainingTrialDays || TRIAL_DAYS;

        const trialDateObj = new Date(sub.trial_end * 1000);
        trialEndDate = {
          iso: trialDateObj.toISOString(),
          us: trialDateObj.toLocaleString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
      }

      // ============================
      // NEXT BILLING DATE
      // ============================
      let rawNext =
        sub.status === "trialing"
          ? sub.trial_end
          : sub.items?.data?.[0]?.current_period_end ||
            sub.current_period_end ||
            null;

      if (rawNext) {
        const dateObj = new Date(rawNext * 1000);

        nextBillingDate = {
          iso: dateObj.toISOString(),
          us: dateObj.toLocaleString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
      }

      // ============================
      // CANCEL DATE
      // ============================
      if (sub.cancel_at_period_end && sub.current_period_end) {
        const dateObj = new Date(sub.current_period_end * 1000);

        subscriptionEndDate = {
          iso: dateObj.toISOString(),
          us: dateObj.toLocaleString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
      }

      // ============================
      // FULLY CANCELED
      // ============================
      if (sub.status === "canceled") {
        const rawEnd = sub.canceled_at || sub.current_period_end;

        if (rawEnd) {
          const dateObj = new Date(rawEnd * 1000);

          subscriptionEndDate = {
            iso: dateObj.toISOString(),
            us: dateObj.toLocaleString("en-US", {
              month: "short",
              day: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          };
        }
      }
    }

    // ============================
    // RESPONSE
    // ============================
    return res.json({
      success: true,
      data: {
        monthly,
        trialDays,
        hasUsedTrial,
        trialEligible: trialActive || !hasUsedTrial,
        trialActive,
        remainingTrialDays,
        trialEndDate,
        currency: monthly.currency,

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
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper || !shipper.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: "Shipper not found or Stripe customer missing",
      });
    }

    // =======================
    // FETCH SUBSCRIPTIONS
    // =======================
    const subscriptions = await stripe.subscriptions.list({
      customer: shipper.stripeCustomerId,
      limit: 10,
      expand: ["data.items.data.price"],
    });

    const nowTs = Math.floor(Date.now() / 1000);

    // =======================
    // PICK CURRENT SUB (FIXED LOGIC)
    // =======================
    const currentSub =
      subscriptions.data.find((sub) => {
        const isValidStatus = ["active", "trialing", "past_due"].includes(
          sub.status
        );

        const stillValid =
          sub.current_period_end && sub.current_period_end > nowTs;

        return isValidStatus || (sub.cancel_at_period_end && stillValid);
      }) || null;

    if (!currentSub) {
      return res.json({
        success: true,
        hasSubscription: false,
        status: "none",
        planType: "monthly",
        hasAccess: false,
        needsSubscription: true,
      });
    }

    const price = currentSub.items?.data?.[0]?.price || {};

    // =======================
    // DATES
    // =======================
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
    // TRIAL LOGIC (SAFE FIX)
    // =======================
    let remainingTrialDays = 0;
    let trialActive = false;

    if (
      currentSub.status === "trialing" &&
      currentSub.trial_end &&
      currentSub.trial_end > nowTs
    ) {
      remainingTrialDays = Math.ceil(
        (currentSub.trial_end - nowTs) / (60 * 60 * 24)
      );

      trialActive = remainingTrialDays > 0;
    }

    // =======================
    // ACCESS LOGIC (FIXED)
    // =======================
    const isCanceled = currentSub.status === "canceled";
    const cancelAtPeriodEnd = currentSub.cancel_at_period_end || false;

    const hasAccess =
      currentSub.status === "active" ||
      currentSub.status === "trialing" ||
      (cancelAtPeriodEnd && currentSub.current_period_end > nowTs);

    // =======================
    // DB SYNC
    // =======================
    await subscriptionModel.findOneAndUpdate(
      { stripeSubscriptionId: currentSub.id },
      {
        shipperId: shipper._id,
        stripeCustomerId: shipper.stripeCustomerId,
        stripeSubscriptionId: currentSub.id,
        stripePriceId: price.id,

        planName: "Shipper Monthly Plan",
        amount: price?.unit_amount / 100 || 0,
        currency: price?.currency || "usd",
        interval: "month",

        status: currentSub.status,

        trialStart: currentSub.trial_start
          ? new Date(currentSub.trial_start * 1000).toISOString()
          : null,

        trialEnd,

        currentPeriodStart,
        currentPeriodEnd,

        cancelAtPeriodEnd,
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
      planType: "monthly",

      hasAccess,

      trialActive,
      remainingTrialDays,

      trialEnd,
      currentPeriodStart,
      currentPeriodEnd,

      cancelAtPeriodEnd,
      canceledAt,

      isTrialing: currentSub.status === "trialing",
      isActive: currentSub.status === "active",
      isPastDue: currentSub.status === "past_due",

      isCanceled,
      needsRenewal: currentSub.status === "past_due",
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
    const [invoices, charges] = await Promise.all([
      stripe.invoices.list({
        customer: shipper.stripeCustomerId,
        limit: 20,
      }),

      stripe.charges.list({
        customer: shipper.stripeCustomerId,
        limit: 20,
      }),
    ]);

    // ⚠️ payouts optional (only if using Stripe Connect)
    let payouts = { data: [] };
    try {
      payouts = await stripe.payouts.list({ limit: 20 });
    } catch (err) {
      console.warn("Payouts not available (Stripe Connect not enabled)");
    }

    // ============================
    // FORMAT INVOICES (SUBSCRIPTION - MONTHLY)
    // ============================
    const subscriptionData = invoices.data.map((inv) => {
      const linePeriod = inv.lines?.data?.[0]?.period || {};
      const periodStart = linePeriod.start || inv.period_start;
      const periodEnd = linePeriod.end || inv.period_end;
      const amount = inv.amount_paid / 100;
      const isNoChargeInvoice = amount === 0;
      const isSubscriptionCreate = inv.billing_reason === "subscription_create";
      const isTrialInvoice = isNoChargeInvoice && isSubscriptionCreate;

      return {
        id: inv.id,

        planType: "monthly",

        amount,
        currency: inv.currency,

        status: inv.status,
        billingReason: inv.billing_reason,
        displayType: isTrialInvoice ? "trial" : "invoice",
        title: isTrialInvoice ? "Free trial started" : "Monthly subscription invoice",
        description: isTrialInvoice
          ? "No payment was charged for this invoice."
          : "Monthly plan invoice generated by Stripe.",
        isTrialInvoice,
        isNoChargeInvoice,

        createdAt: new Date(inv.created * 1000),

        periodStart: periodStart ? new Date(periodStart * 1000) : null,

        periodEnd: periodEnd ? new Date(periodEnd * 1000) : null,

        paid: inv.paid,

        paidAt: inv.status_transitions?.paid_at
          ? new Date(inv.status_transitions.paid_at * 1000)
          : null,

        invoicePdf: inv.invoice_pdf,
        hostedInvoiceUrl: inv.hosted_invoice_url,
      };
    });

    // ============================
    // FORMAT CHARGES (PAYMENTS)
    // ============================
    const paymentData = charges.data.map((ch) => ({
      id: ch.id,

      planType: "monthly",

      amount: ch.amount / 100,
      currency: ch.currency,

      status: ch.status,
      paid: ch.paid,
      refunded: ch.refunded,

      createdAt: new Date(ch.created * 1000),

      receiptUrl: ch.receipt_url,
      invoiceId: ch.invoice,
      title: "Card payment receipt",
      description: "Card charge collected by Stripe for a paid invoice.",

      paymentMethod: ch.payment_method_details?.type,
      cardBrand: ch.payment_method_details?.card?.brand,
      last4: ch.payment_method_details?.card?.last4,
    }));

    // ============================
    // FORMAT PAYOUTS (OPTIONAL)
    // ============================
    const payoutData = payouts.data.map((po) => ({
      id: po.id,
      amount: po.amount / 100,
      currency: po.currency,

      status: po.status,

      arrivalDate: new Date(po.arrival_date * 1000),
      createdAt: new Date(po.created * 1000),

      method: po.method,
    }));

    // ============================
    // FINAL RESPONSE
    // ============================
    return res.json({
      success: true,

      data: {
        planType: "monthly",

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
