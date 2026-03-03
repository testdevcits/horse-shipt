const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const Shipper = require("../../models/shipper/shipperModel");

// ==========================================================
// CREATE STRIPE CONNECT ACCOUNT
// ==========================================================

exports.createStripeAccount = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper) {
      return res.status(404).json({ message: "Shipper not found" });
    }

    if (shipper.stripeAccountId) {
      return res.status(400).json({
        message: "Stripe account already created",
      });
    }

    const account = await stripe.accounts.create({
      type: "express",
      country: "SG", // change if needed
      email: shipper.email,
      capabilities: {
        transfers: { requested: true },
      },
    });

    shipper.stripeAccountId = account.id;
    await shipper.save();

    res.status(200).json({
      success: true,
      message: "Stripe account created successfully",
      stripeAccountId: account.id,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==========================================================
// GENERATE STRIPE ONBOARDING LINK
// ==========================================================

exports.createOnboardingLink = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper) {
      return res.status(404).json({
        message: "Shipper not found",
      });
    }

    if (!shipper.stripeAccountId) {
      return res.status(400).json({
        message: "Please create Stripe account first",
      });
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: shipper.stripeAccountId,
      refresh_url:
        "https://horse-shipt-frontend.vercel.app/shipper/dashboard?stripe=refresh",
      return_url:
        "https://horse-shipt-frontend.vercel.app/shipper/dashboard?stripe=success",
      type: "account_onboarding",
    });

    res.status(200).json({
      success: true,
      message: "Redirect shipper to Stripe onboarding",
      onboardingUrl: accountLink.url,
    });
  } catch (error) {
    console.error("Stripe Onboarding Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
// ==========================================================
// CHECK STRIPE ACCOUNT STATUS (Manual Check)
// ==========================================================

exports.checkStripeStatus = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id);

    if (!shipper || !shipper.stripeAccountId) {
      return res.status(400).json({
        message: "Stripe account not created",
      });
    }

    const account = await stripe.accounts.retrieve(shipper.stripeAccountId);

    const verified = account.charges_enabled && account.payouts_enabled;

    shipper.stripeVerified = verified;
    shipper.stripeChargesEnabled = account.charges_enabled;
    shipper.stripePayoutsEnabled = account.payouts_enabled;
    shipper.stripeOnboardingCompleted = account.details_submitted;

    await shipper.save();

    res.status(200).json({
      success: true,
      verified,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      onboardingCompleted: account.details_submitted,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==========================================================
// STRIPE WEBHOOK (VERY IMPORTANT)
// ==========================================================

exports.stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle account updates
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
