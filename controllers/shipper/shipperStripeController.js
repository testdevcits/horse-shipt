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
      // SUBSCRIPTION CREATED / UPDATED
      // =====================================================
      case "customer.subscription.created":
      case "customer.subscription.updated":
        {
          const subscription = data;
          const SubscriptionModel = require("../../models/shipper/subscriptionModel");

          console.log("=== SUBSCRIPTION CREATE/UPDATE ===", {
            id: subscription.id,
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          });

          const existingSub = await SubscriptionModel.findOne({
            stripeSubscriptionId: subscription.id,
          });

          if (existingSub) {
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

            //cancel at period end- keep ACTIVE
            let finalStatus = subscription.status;

            if (
              subscription.cancel_at_period_end &&
              ["active", "trialing"].includes(subscription.status)
            ) {
              finalStatus = subscription.status;
            }

            existingSub.status = finalStatus;
            existingSub.currentPeriodStart = currentPeriodStart;
            existingSub.currentPeriodEnd = currentPeriodEnd;
            existingSub.cancelAtPeriodEnd = subscription.cancel_at_period_end;

            existingSub.trialStart = subscription.trial_start
              ? new Date(subscription.trial_start * 1000)
              : null;

            existingSub.trialEnd = subscription.trial_end
              ? new Date(subscription.trial_end * 1000)
              : null;
            existingSub.cancelScheduledAt = subscription.cancel_at_period_end
              ? currentPeriodEnd
              : null;

            await existingSub.save();

            console.log("Subscription updated:", subscription.id);
          } else {
            console.log("⚠️ Subscription not found:", subscription.id);
          }
        }
        break;

      // =====================================================
      // SUBSCRIPTION CANCELED (FINAL ONLY)
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
            existingSub.cancelScheduledAt = null;

            await existingSub.save();

            console.log("Subscription canceled:", subscription.id);
          } else {
            console.log("Subscription not found:", subscription.id);
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
    const { withTrial = true, planType = "monthly" } = req.body;

    // ============================
    // CONFIG (ENV BASED)
    // ============================
    const PRICES = {
      monthly: process.env.STRIPE_MONTHLY_PRICE_ID,
      annual: process.env.STRIPE_ANNUAL_PRICE_ID,
    };

    const selectedPriceId = PRICES[planType];

    if (!selectedPriceId) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan type",
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
    // CHECK EXISTING SUBSCRIPTION
    // ============================
    const existingSub = await subscriptionModel.findOne({
      shipperId: shipper._id,
      status: { $in: ["active", "trialing", "past_due"] },
    });

    if (existingSub) {
      return res.status(400).json({
        success: false,
        message: "Subscription already exists",
      });
    }

    // ============================
    // PREPARE SUBSCRIPTION DATA
    // ============================
    const subscriptionData = {
      customer: shipper.stripeCustomerId,
      items: [{ price: selectedPriceId }],
      default_payment_method: shipper.paymentMethodId,
      expand: ["items.data.price"],

      metadata: {
        shipperId: shipper._id.toString(),
        email: shipper.email,
        plan: planType === "annual" ? "Annual Plan" : "Monthly Plan",
      },
    };

    // ============================
    // TRIAL LOGIC
    // ============================
    if (withTrial && !shipper.hasUsedTrial && planType === "monthly") {
      subscriptionData.trial_period_days = 30;
      console.log("Trial Applied (30 days)");
    }

    // ============================
    // CREATE SUBSCRIPTION
    // ============================
    const subscription = await stripe.subscriptions.create(subscriptionData);

    const price = subscription.items.data[0].price;

    // ============================
    // DATE HANDLING
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
    const newSubscription = await subscriptionModel.create({
      shipperId: shipper._id,

      stripeCustomerId: shipper.stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: price.id,

      planName:
        planType === "annual"
          ? "Shipper Pro Access (Annual)"
          : "Shipper Pro Access (Monthly)",

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

    // ============================
    // MARK TRIAL USED
    // ============================
    if (subscription.trial_start) {
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
        planType,
        subscriptionId: newSubscription._id,
        status: newSubscription.status,
        trialEnd: newSubscription.trialEnd,
        currentPeriodEnd: newSubscription.currentPeriodEnd,
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
  console.log("=== CANCEL SUBSCRIPTION API HIT ===");

  try {
    const { cancelImmediately = false, reason = "User requested" } = req.body;

    const shipper = await Shipper.findById(req.user.id);

    if (!shipper) {
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

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "No active subscription found",
      });
    }

    // ============================
    // FETCH LATEST FROM STRIPE
    // ============================
    const stripeSub = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );
    if (stripeSub.status === "canceled") {
      subscription.status = "canceled";
      subscription.cancelAtPeriodEnd = false;
      subscription.canceledAt = stripeSub.canceled_at
        ? new Date(stripeSub.canceled_at * 1000)
        : new Date();

      await subscription.save();

      return res.json({
        success: true,
        message: "Subscription already canceled",
        data: {
          status: subscription.status,
          canceledAt: subscription.canceledAt,
        },
      });
    }

    let updatedStripeSub;

    // ============================
    // CANCEL LOGIC
    // ============================
    if (cancelImmediately) {
      console.log("Canceling immediately...");

      updatedStripeSub = await stripe.subscriptions.del(
        subscription.stripeSubscriptionId
      );
      subscription.status = "canceled";
      subscription.cancelAtPeriodEnd = false;
    } else {
      console.log("Cancel at period end...");

      updatedStripeSub = await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        }
      );
      subscription.cancelAtPeriodEnd = true;
      subscription.status = stripeSub.status;
    }

    // ============================
    // DATE HANDLING
    // ============================
    let canceledAt = new Date();

    if (updatedStripeSub?.canceled_at) {
      canceledAt = new Date(updatedStripeSub.canceled_at * 1000);
    }

    // ============================
    // UPDATE DB
    // ============================
    subscription.canceledAt = canceledAt;
    subscription.cancelReason = reason;

    // Important: store end date for UI
    if (updatedStripeSub?.current_period_end) {
      subscription.currentPeriodEnd = new Date(
        updatedStripeSub.current_period_end * 1000
      );
    }

    await subscription.save();

    // ============================
    // RESPONSE
    // ============================
    return res.json({
      success: true,
      message: cancelImmediately
        ? "Subscription canceled immediately"
        : "Subscription will remain active until period end",

      data: {
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
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
exports.getSubscriptionPlan = async (req, res) => {
  try {
    console.log("========== GET SUBSCRIPTION PLAN API ==========");

    // ============================
    // CONFIG (ENV)
    // ============================
    const MONTHLY_PRICE_ID = process.env.STRIPE_MONTHLY_PRICE_ID;

    console.log("ENV CHECK:");
    console.log("MONTHLY_PRICE_ID:", MONTHLY_PRICE_ID);
    console.log(
      "STRIPE KEY TYPE:",
      process.env.STRIPE_SECRET_KEY?.startsWith("sk_live") ? "LIVE" : "TEST"
    );

    if (!MONTHLY_PRICE_ID) {
      console.error("Monthly price ID missing in ENV");
      return res.status(500).json({
        success: false,
        message: "Monthly price ID not configured",
      });
    }

    // ============================
    // FETCH MONTHLY PLAN
    // ============================
    console.log("➡️ Fetching MONTHLY price from Stripe...");

    let monthlyPrice;

    try {
      monthlyPrice = await stripe.prices.retrieve(MONTHLY_PRICE_ID, {
        expand: ["product"],
      });

      console.log("Monthly price fetched:", {
        id: monthlyPrice.id,
        amount: monthlyPrice.unit_amount,
        currency: monthlyPrice.currency,
        interval: monthlyPrice.recurring?.interval,
        product: monthlyPrice.product?.name,
      });
    } catch (err) {
      console.error("Stripe MONTHLY price error:");
      console.error("Price ID used:", MONTHLY_PRICE_ID);
      console.error(err);

      return res.status(500).json({
        success: false,
        message: "Invalid Monthly Price ID in Stripe",
      });
    }

    const monthly = {
      priceId: monthlyPrice.id,
      amount: monthlyPrice.unit_amount / 100,
      currency: monthlyPrice.currency,
      interval: monthlyPrice.recurring.interval,
      productName: monthlyPrice.product.name,
      label: "Introductory Price",
      planType: "monthly",
    };

    // ============================
    // RESPONSE (ONLY MONTHLY)
    // ============================
    const responseData = {
      monthly,
      annual: null,
      trialDays: 30,
      currency: monthly.currency,
    };

    console.log("FINAL RESPONSE:", responseData);
    console.log("========== END ==========\n");

    return res.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("Plan Fetch Error (GLOBAL):", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET CURRENT SHIPPER SUBSCRIPTION STATUS
exports.getShipperSubscriptionStatus = async (req, res) => {
  try {
    console.log("=== getShipperSubscriptionStatus triggered ===");

    const shipper = await Shipper.findById(req.user.id);

    if (!shipper || !shipper.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: "Shipper not found or Stripe customer missing",
      });
    }

    // =======================
    // FETCH SUBSCRIPTIONS FROM STRIPE
    // =======================
    const subscriptions = await stripe.subscriptions.list({
      customer: shipper.stripeCustomerId,
      status: "all",
      expand: ["data.items.data.price"],
    });

    // =======================
    // FIND CURRENT SUBSCRIPTION
    // =======================
    const currentSub = subscriptions.data.find((sub) =>
      ["trialing", "active", "past_due"].includes(sub.status)
    );

    if (!currentSub) {
      return res.json({
        success: true,
        hasSubscription: false,
        status: "none",
        message: "No active subscription",
      });
    }

    const price = currentSub.items.data[0].price;

    // =======================
    // PLAN TYPE DETECTION
    // =======================
    const planType = price.recurring.interval === "year" ? "annual" : "monthly";

    // =======================
    // DATE HANDLING
    // =======================
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
      trialActive = true;
    }

    // =======================
    // ACCESS CONTROL
    // =======================
    const hasAccess =
      currentSub.status === "active" || currentSub.status === "trialing";

    // =======================
    // SYNC DB
    // =======================
    await subscriptionModel.findOneAndUpdate(
      { stripeSubscriptionId: currentSub.id },
      {
        shipperId: shipper._id,
        stripeCustomerId: shipper.stripeCustomerId,
        stripeSubscriptionId: currentSub.id,
        stripePriceId: price.id,

        planName:
          planType === "annual"
            ? "Shipper Pro Access (Annual)"
            : "Shipper Pro Access (Monthly)",

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

    // =======================
    // RESPONSE
    // =======================
    return res.json({
      success: true,

      hasSubscription: true,
      hasAccess,

      status: currentSub.status,
      planType,

      trialActive,
      remainingTrialDays,

      trialEnd: currentSub.trial_end
        ? new Date(currentSub.trial_end * 1000)
        : null,

      currentPeriodStart,
      currentPeriodEnd,

      cancelAtPeriodEnd: currentSub.cancel_at_period_end,
    });
  } catch (error) {
    console.error("Get Subscription Status Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
