// ==========================================================
// IMPORTS
// ==========================================================
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const Shipper = require("../../models/shipper/shipperModel");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");

// ==========================================================
// CREATE STRIPE CONNECT ACCOUNT
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

exports.createStripeAccount = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);
    if (!shipper)
      return res
        .status(404)
        .json({ success: false, message: "Shipper not found" });

    if (shipper.stripeAccountId) {
      return res
        .status(200)
        .json({
          success: true,
          message: "Stripe account already exists",
          stripeAccountId: shipper.stripeAccountId,
        });
    }

    const platformCountry = await getPlatformCountry();
    const allowedCountries = ["US", "IN"];
    const accountCountry = allowedCountries.includes(platformCountry)
      ? platformCountry
      : "US";

    const account = await stripe.accounts.create({
      type: "express",
      country: accountCountry,
      email: shipper.email,
      business_type: "individual",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    shipper.stripeAccountId = account.id;
    await shipper.save();

    res
      .status(200)
      .json({
        success: true,
        message: "Stripe account created successfully",
        stripeAccountId: account.id,
        accountCountry,
      });
  } catch (error) {
    console.error("Stripe Account Creation Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================================
// CREATE ONBOARDING LINK
// ==========================================================
exports.createOnboardingLink = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);
    if (!shipper?.stripeAccountId)
      return res
        .status(400)
        .json({ success: false, message: "Stripe account not created" });

    const accountLink = await stripe.accountLinks.create({
      account: shipper.stripeAccountId,
      refresh_url:
        "https://horse-shipt-frontend.vercel.app/shipper/dashboard?stripe=refresh",
      return_url:
        "https://horse-shipt-frontend.vercel.app/shipper/dashboard?stripe=success",
      type: "account_onboarding",
      collect: "eventually_due",
    });

    res.json({ success: true, onboardingUrl: accountLink.url });
  } catch (error) {
    console.error("Onboarding Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================================
// CHECK STRIPE ACCOUNT STATUS
// ==========================================================
exports.checkStripeStatus = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);
    if (!shipper?.stripeAccountId)
      return res
        .status(400)
        .json({ success: false, message: "Stripe account not created" });

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
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================================
// STRIPE WEBHOOK (FOR CONNECT ACCOUNT + PAYMENT EVENTS)
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
    switch (event.type) {
      case "account.updated":
        {
          const account = event.data.object;
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
            console.log("Shipper Stripe status updated:", shipper._id);
          }
        }
        break;

      case "payment_intent.succeeded":
        {
          const paymentIntent = event.data.object;
          const quoteId = paymentIntent.metadata?.quoteId;
          if (quoteId) {
            await ShipmentQuote.findByIdAndUpdate(quoteId, {
              paymentStatus: "paid",
              paymentCompletedAt: new Date(),
            });
            console.log("Payment success for quote:", quoteId);
          }
        }
        break;

      case "payment_intent.payment_failed":
        {
          const paymentIntent = event.data.object;
          const quoteId = paymentIntent.metadata?.quoteId;
          if (quoteId) {
            await ShipmentQuote.findByIdAndUpdate(quoteId, {
              paymentStatus: "failed",
            });
            console.log("Payment failed for quote:", quoteId);
          }
        }
        break;

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook Processing Error:", error);
    res
      .status(500)
      .json({ success: false, error: "Webhook processing failed" });
  }
};
