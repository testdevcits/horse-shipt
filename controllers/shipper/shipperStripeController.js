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

    switch (event.type) {
      // =====================================================
      // CONNECT ACCOUNT UPDATED
      // =====================================================
      case "account.updated":
        {
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

            console.log("Stripe account updated for shipper:", shipper._id);
          }
        }
        break;

      // =====================================================
      // PAYMENT SUCCESS (SHIPMENT)
      // =====================================================
      case "payment_intent.succeeded":
        {
          const paymentIntent = data;
          const quoteId = paymentIntent.metadata?.quoteId;

          if (quoteId) {
            await ShipmentQuote.findByIdAndUpdate(quoteId, {
              paymentStatus: "paid",
              paymentCompletedAt: new Date(),
              stripePaymentIntentId: paymentIntent.id,
            });

            console.log("Payment success for quote:", quoteId);
          }
        }
        break;

      // =====================================================
      // PAYMENT FAILED (SHIPMENT)
      // =====================================================
      case "payment_intent.payment_failed":
        {
          const paymentIntent = data;
          const quoteId = paymentIntent.metadata?.quoteId;

          if (quoteId) {
            await ShipmentQuote.findByIdAndUpdate(quoteId, {
              paymentStatus: "failed",
            });

            console.log("Payment failed for quote:", quoteId);
          }
        }
        break;

      // =====================================================
      // CHARGE SUCCEEDED
      // =====================================================
      case "charge.succeeded":
        {
          const charge = data;
          console.log("Charge succeeded:", charge.id);
        }
        break;

      // =====================================================
      // TRANSFER CREATED
      // =====================================================
      case "transfer.created":
        {
          const transfer = data;

          console.log("Transfer created:", transfer.id);

          const quoteId = transfer.metadata?.quoteId;

          if (quoteId) {
            await ShipmentQuote.findByIdAndUpdate(quoteId, {
              transferId: transfer.id,
            });
          }
        }
        break;

      // =====================================================
      // PAYOUT COMPLETED
      // =====================================================
      case "payout.paid":
        {
          const payout = data;
          console.log("Payout completed:", payout.id);
        }
        break;

      // =====================================================
      // SUBSCRIPTION CREATED / UPDATED (FIXED)
      // =====================================================
      case "customer.subscription.created":
      case "customer.subscription.updated":
        {
          const subscription = data;

          const SubscriptionModel = require("../../models/shipper/subscriptionModel");

          console.log("=== SUBSCRIPTION CREATE/UPDATE ===", {
            id: subscription.id,
            status: subscription.status,
          });

          const existingSub = await SubscriptionModel.findOne({
            stripeSubscriptionId: subscription.id,
          });

          if (existingSub) {
            // SAFE DATE HANDLING (FIX)
            const currentPeriodStart = subscription.current_period_start
              ? new Date(subscription.current_period_start * 1000)
              : subscription.trial_start
              ? new Date(subscription.trial_start * 1000)
              : null;

            const currentPeriodEnd = subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000)
              : subscription.trial_end
              ? new Date(subscription.trial_end * 1000)
              : null;

            existingSub.status = subscription.status;
            existingSub.currentPeriodStart = currentPeriodStart;
            existingSub.currentPeriodEnd = currentPeriodEnd;
            existingSub.cancelAtPeriodEnd = subscription.cancel_at_period_end;

            // Trial fields (important)
            existingSub.trialStart = subscription.trial_start
              ? new Date(subscription.trial_start * 1000)
              : null;

            existingSub.trialEnd = subscription.trial_end
              ? new Date(subscription.trial_end * 1000)
              : null;

            await existingSub.save();

            console.log("Subscription updated:", subscription.id);
          } else {
            console.log("⚠️ Subscription not found:", subscription.id);
          }
        }
        break;

      // =====================================================
      // SUBSCRIPTION CANCELED (FIXED)
      // =====================================================
      case "customer.subscription.deleted":
        {
          const subscription = data;

          const SubscriptionModel = require("../../models/shipper/subscriptionModel");

          console.log("=== SUBSCRIPTION CANCELED ===", subscription.id);

          const existingSub = await SubscriptionModel.findOne({
            stripeSubscriptionId: subscription.id,
          });

          if (existingSub) {
            existingSub.status = "canceled";

            existingSub.canceledAt = subscription.canceled_at
              ? new Date(subscription.canceled_at * 1000)
              : new Date();

            existingSub.cancelAtPeriodEnd = false;

            await existingSub.save();

            console.log("Subscription canceled:", subscription.id);
          } else {
            console.log("⚠️ Subscription not found:", subscription.id);
          }
        }
        break;

      // =====================================================
      // SUBSCRIPTION PAYMENT SUCCESS (FIXED)
      // =====================================================
      case "invoice.paid":
        {
          const invoice = data;

          const SubscriptionModel = require("../../models/shipper/subscriptionModel");

          const sub = await SubscriptionModel.findOne({
            stripeSubscriptionId: invoice.subscription,
          });

          if (sub) {
            sub.status = "active";
            sub.lastPaymentDate = new Date();

            if (invoice.lines?.data?.length > 0) {
              const periodEnd = invoice.lines.data[0].period?.end;

              sub.nextBillingDate = periodEnd
                ? new Date(periodEnd * 1000)
                : null;
            }

            await sub.save();

            console.log("Subscription payment success:", sub._id);
          } else {
            console.log("⚠️ Subscription not found:", invoice.subscription);
          }
        }
        break;

      // =====================================================
      // SUBSCRIPTION PAYMENT FAILED (FIXED)
      // =====================================================
      case "invoice.payment_failed":
        {
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
              shipper.lastPaymentFailure = new Date();
              shipper.paymentFailureReason = "Subscription payment failed";

              await shipper.save();
            }

            console.log("Subscription payment failed:", sub._id);
          } else {
            console.log("⚠️ Subscription not found:", invoice.subscription);
          }
        }
        break;

      // =====================================================
      // DEFAULT
      // =====================================================
      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
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
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper || !shipper.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: "Stripe customer not found",
      });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: shipper.stripeCustomerId,
      payment_method_types: ["card"],
    });

    console.log("SetupIntent created:", setupIntent.id);

    res.json({
      success: true,
      clientSecret: setupIntent.client_secret,
    });
  } catch (error) {
    console.error("SetupIntent Error:", error);

    res.status(500).json({
      success: false,
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
  console.log("=== CREATE SUBSCRIPTION API HIT ===");

  try {
    const { withTrial = true } = req.body;
    console.log("Request Body:", req.body);

    // ============================
    // FETCH SHIPPER
    // ============================
    const shipper = await Shipper.findById(req.user.id);

    console.log("Shipper Found:", {
      id: shipper?._id,
      email: shipper?.email,
      stripeCustomerId: shipper?.stripeCustomerId,
      paymentMethodId: shipper?.paymentMethodId,
    });

    if (!shipper || !shipper.stripeCustomerId || !shipper.paymentMethodId) {
      console.log("Missing customer or payment method");
      return res.status(400).json({
        success: false,
        message: "Customer or card not found",
      });
    }

    // ============================
    // CHECK EXISTING SUBSCRIPTION
    // ============================
    const existingSub = await subscriptionModel.findOne({
      shipperId: shipper._id,
      status: { $in: ["active", "trialing", "past_due"] },
    });

    console.log("Existing Subscription:", existingSub);

    if (existingSub) {
      console.log("⚠️ Subscription already exists");
      return res.status(400).json({
        success: false,
        message: "Subscription already exists",
      });
    }

    // ============================
    // CREATE STRIPE SUBSCRIPTION
    // ============================
    const subscriptionData = {
      customer: shipper.stripeCustomerId,
      items: [
        {
          price: "price_1TJYYMCVoPk11ijLlM4ABav8",
        },
      ],
      default_payment_method: shipper.paymentMethodId,
      expand: ["items.data.price"],
      metadata: {
        shipperId: shipper._id.toString(),
        email: shipper.email,
        plan: "Horse Shipt Premium",
      },
    };

    if (withTrial) {
      subscriptionData.trial_period_days = 30;
      console.log("Trial enabled (30 days)");
    }

    console.log("Creating Stripe subscription...");
    const subscription = await stripe.subscriptions.create(subscriptionData);

    console.log("Stripe Subscription Created:", {
      id: subscription.id,
      status: subscription.status,
    });

    // ============================
    // DEBUG STRIPE DATES
    // ============================
    console.log("Stripe Dates Debug:", {
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      trial_start: subscription.trial_start,
      trial_end: subscription.trial_end,
    });

    const price = subscription.items.data[0].price;

    // ============================
    // SAFE DATE HANDLING (FIXED)
    // ============================
    const currentPeriodStart = subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : subscription.trial_start
      ? new Date(subscription.trial_start * 1000)
      : null;

    const currentPeriodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null;

    // ============================
    // SAVE IN DB
    // ============================
    console.log("Saving subscription in DB...");

    const newSubscription = await subscriptionModel.create({
      shipperId: shipper._id,

      stripeCustomerId: shipper.stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: price.id,

      planName: "Horse Shipt Premium",

      amount: price.unit_amount / 100,
      currency: price.currency,
      interval: price.recurring.interval,

      status: subscription.status,

      trialStart: subscription.trial_start
        ? new Date(subscription.trial_start * 1000)
        : null,

      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,

      currentPeriodStart,
      currentPeriodEnd,

      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });

    console.log("Subscription saved in DB:", newSubscription._id);

    // ============================
    // RESPONSE
    // ============================
    res.json({
      success: true,
      message: "Subscription created successfully",
      data: {
        status: newSubscription.status,
        trialEnd: newSubscription.trialEnd,
      },
    });
  } catch (error) {
    console.error("SUBSCRIPTION ERROR FULL:", error);

    if (error.raw) {
      console.error("Stripe Error:", error.raw.message);
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ==========================================================
// CANCEL SUBSCRIPTION
// ==========================================================
exports.cancelSubscription = async (req, res) => {
  console.log("=== CANCEL SUBSCRIPTION API HIT ===");

  try {
    const { cancelImmediately = false, reason = "User requested" } = req.body;
    console.log("Request Body:", req.body);

    // ============================
    // FETCH SHIPPER
    // ============================
    const shipper = await Shipper.findById(req.user.id);

    console.log("Shipper Found:", {
      id: shipper?._id,
      email: shipper?.email,
    });

    if (!shipper) {
      console.log("Shipper not found");
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    // ============================
    // FIND ACTIVE SUBSCRIPTION
    // ============================
    const subscription = await subscriptionModel.findOne({
      shipperId: shipper._id,
      status: { $in: ["active", "trialing", "past_due"] },
    });

    console.log("Subscription Found:", subscription);

    if (!subscription) {
      console.log("No active subscription found");
      return res.status(404).json({
        success: false,
        message: "No active subscription found",
      });
    }

    // ============================
    // ALREADY CANCELED CHECK
    // ============================
    if (subscription.status === "canceled") {
      console.log("Subscription already canceled");
      return res.status(400).json({
        success: false,
        message: "Subscription already canceled",
      });
    }

    let updatedStripeSub;

    // ============================
    // CANCEL LOGIC
    // ============================
    console.log("Cancel Immediately:", cancelImmediately);

    if (cancelImmediately) {
      console.log("Canceling subscription immediately in Stripe...");

      updatedStripeSub = await stripe.subscriptions.del(
        subscription.stripeSubscriptionId
      );

      console.log("Stripe Immediate Cancel Response:", {
        id: updatedStripeSub.id,
        status: updatedStripeSub.status,
        canceled_at: updatedStripeSub.canceled_at,
      });

      // Immediate cancel → update DB fully
      subscription.status = "canceled";
      subscription.cancelAtPeriodEnd = false;
    } else {
      console.log("Setting cancel at period end in Stripe...");

      updatedStripeSub = await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        }
      );

      console.log("Stripe Update Response:", {
        id: updatedStripeSub.id,
        cancel_at_period_end: updatedStripeSub.cancel_at_period_end,
        current_period_end: updatedStripeSub.current_period_end,
      });

      // IMPORTANT: status stays active until period end
      subscription.cancelAtPeriodEnd = true;
    }

    // ============================
    // SAFE DATE HANDLING
    // ============================
    const canceledAt = new Date();

    // ============================
    // UPDATE DB
    // ============================
    console.log("Updating subscription in DB...");

    subscription.canceledAt = canceledAt;
    subscription.cancelReason = reason;

    // Optional: store Stripe cancel time if available
    if (updatedStripeSub?.canceled_at) {
      subscription.canceledAt = new Date(updatedStripeSub.canceled_at * 1000);
    }

    await subscription.save();

    console.log("Subscription updated in DB:", {
      id: subscription._id,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt,
    });

    // ============================
    // RESPONSE
    // ============================
    res.json({
      success: true,
      message: cancelImmediately
        ? "Subscription canceled immediately"
        : "Subscription will cancel at period end",
      data: {
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        status: subscription.status,
        canceledAt: subscription.canceledAt,
      },
    });
  } catch (error) {
    console.error("CANCEL SUBSCRIPTION ERROR FULL:", error);

    if (error.raw) {
      console.error("Stripe Error:", error.raw.message);
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// GET PLAN DETAILS
exports.getSubscriptionPlan = async (req, res) => {
  try {
    const priceId = "price_1TJYYMCVoPk11ijLlM4ABav8";

    const price = await stripe.prices.retrieve(priceId, {
      expand: ["product"],
    });

    res.json({
      success: true,
      data: {
        priceId: price.id,
        amount: price.unit_amount / 100,
        currency: price.currency,
        interval: price.recurring.interval,
        productName: price.product.name,
      },
    });
  } catch (error) {
    console.error("Plan Fetch Error:", error);
    res.status(500).json({ error: error.message });
  }
};

// GET CURRENT SHIPPER SUBSCRIPTION STATUS
exports.getShipperSubscriptionStatus = async (req, res) => {
  try {
    console.log("=== getShipperSubscriptionStatus triggered ===");
    console.log("Shipper ID from token:", req.user.id);

    const shipper = await Shipper.findById(req.user.id);

    if (!shipper || !shipper.stripeCustomerId) {
      console.log("Shipper not found or missing Stripe Customer ID");
      return res.status(400).json({
        success: false,
        message: "Shipper not found or Stripe customer missing",
      });
    }

    console.log(
      "Shipper found:",
      shipper._id,
      "StripeCustomerId:",
      shipper.stripeCustomerId
    );

    // =======================
    // FETCH SUBSCRIPTIONS FROM STRIPE
    // =======================
    const subscriptions = await stripe.subscriptions.list({
      customer: shipper.stripeCustomerId,
      status: "all", // trialing, active, canceled, past_due etc.
      expand: ["data.items.data.price"],
    });

    console.log(
      "Subscriptions fetched from Stripe:",
      subscriptions.data.length
    );

    const currentSub = subscriptions.data.find((sub) =>
      ["trialing", "active"].includes(sub.status)
    );

    if (!currentSub) {
      console.log("No active or trial subscription found for this shipper");
      return res.json({
        success: true,
        trialActive: false,
        message: "No active or trial subscription found",
      });
    }

    console.log(
      "Current subscription found:",
      currentSub.id,
      "Status:",
      currentSub.status
    );

    // =======================
    // TRIAL REMAINING DAYS
    // =======================
    let remainingTrialDays = 0;
    if (currentSub.status === "trialing" && currentSub.trial_end) {
      const now = Math.floor(Date.now() / 1000);
      remainingTrialDays = Math.ceil(
        (currentSub.trial_end - now) / (60 * 60 * 24)
      );
      console.log("Trial is active, remaining days:", remainingTrialDays);
    }

    // =======================
    // UPDATE DB (OPTIONAL SYNC)
    // =======================
    const price = currentSub.items.data[0].price;
    const currentPeriodStart = currentSub.current_period_start
      ? new Date(currentSub.current_period_start * 1000)
      : currentSub.trial_start
      ? new Date(currentSub.trial_start * 1000)
      : null;

    const currentPeriodEnd = currentSub.current_period_end
      ? new Date(currentSub.current_period_end * 1000)
      : currentSub.trial_end
      ? new Date(currentSub.trial_end * 1000)
      : null;

    console.log("Updating subscription DB record for:", currentSub.id);

    await subscriptionModel.findOneAndUpdate(
      { stripeSubscriptionId: currentSub.id },
      {
        shipperId: shipper._id,
        stripeCustomerId: shipper.stripeCustomerId,
        stripeSubscriptionId: currentSub.id,
        stripePriceId: price.id,
        planName: "Horse Shipt Premium",
        amount: price.unit_amount / 100,
        currency: price.currency,
        interval: price.recurring.interval,
        status: currentSub.status,
        trialStart: currentSub.trial_start
          ? new Date(currentSub.trial_start * 1000)
          : null,
        trialEnd: currentSub.trial_end
          ? new Date(currentSub.trial_end * 1000)
          : null,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: currentSub.cancel_at_period_end,
      },
      { upsert: true, new: true }
    );

    console.log("Subscription DB updated successfully");

    // =======================
    // RESPONSE TO FRONTEND
    // =======================
    res.json({
      success: true,
      trialActive: currentSub.status === "trialing",
      status: currentSub.status,
      remainingTrialDays,
      trialEnd: currentSub.trial_end
        ? new Date(currentSub.trial_end * 1000)
        : null,
      currentPeriodStart,
      currentPeriodEnd,
    });

    console.log("Response sent to frontend:", {
      trialActive: currentSub.status === "trialing",
      status: currentSub.status,
      remainingTrialDays,
    });
  } catch (error) {
    console.error("Get Shipper Subscription Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
