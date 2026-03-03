const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const Shipper = require("../../models/shipper/shipperModel");

// ==========================================================
// CREATE STRIPE CONNECT ACCOUNT (UPDATED)
// ==========================================================

exports.createStripeAccount = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper) {
      return res.status(404).json({ message: "Shipper not found" });
    }

    // Prevent duplicate account creation
    if (shipper.stripeAccountId) {
      return res.status(200).json({
        message: "Stripe account already exists",
        stripeAccountId: shipper.stripeAccountId,
      });
    }

    // Marketplace Singapore requirement fix
    const account = await stripe.accounts.create({
      type: "express",
      country: "SG",
      email: shipper.email,

      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    shipper.stripeAccountId = account.id;
    await shipper.save();

    res.status(200).json({
      success: true,
      stripeAccountId: account.id,
    });
  } catch (error) {
    console.error("Create Stripe Account Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// ==========================================================
// CREATE ONBOARDING LINK
// ==========================================================

exports.createOnboardingLink = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper?.stripeAccountId) {
      return res.status(400).json({
        message: "Create Stripe account first",
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: shipper.stripeAccountId,

      refresh_url:
        "https://horse-shipt-frontend.vercel.app/shipper/dashboard?stripe=refresh",

      return_url:
        "https://horse-shipt-frontend.vercel.app/shipper/dashboard?stripe=success",

      type: "account_onboarding",
    });

    res.json({
      onboardingUrl: accountLink.url,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
};

// ==========================================================
// CHECK ACCOUNT STATUS
// ==========================================================

exports.checkStripeStatus = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper?.stripeAccountId) {
      return res.status(400).json({
        message: "Stripe account not created",
      });
    }

    const account = await stripe.accounts.retrieve(shipper.stripeAccountId);

    shipper.stripeChargesEnabled = account.charges_enabled;
    shipper.stripePayoutsEnabled = account.payouts_enabled;
    shipper.stripeOnboardingCompleted = account.details_submitted;

    shipper.stripeVerified = account.charges_enabled && account.payouts_enabled;

    await shipper.save();

    res.json({
      verified: shipper.stripeVerified,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      onboardingCompleted: account.details_submitted,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==========================================================
// WEBHOOK (VERY IMPORTANT — USE RAW BODY)
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

  // Account Update Event
  if (event.type === "account.updated") {
    const account = event.data.object;

    const shipper = await Shipper.findOne({
      stripeAccountId: account.id,
    });

    if (shipper) {
      shipper.stripeChargesEnabled = account.charges_enabled;
      shipper.stripePayoutsEnabled = account.payouts_enabled;
      shipper.stripeOnboardingCompleted = account.details_submitted;

      shipper.stripeVerified =
        account.charges_enabled && account.payouts_enabled;

      await shipper.save();
    }
  }

  res.json({ received: true });
};
