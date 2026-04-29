const Customer = require("../../models/customer/customerModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");

exports.getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({})
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: customers.length,
      data: customers,
    });
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findById(id).select("-password");

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const shipments = await CustomerShipment.find({ customer: id })
      .populate("shipper", "name email uniqueId phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        customer,
        shipments,
      },
    });
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.updateCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const updateFields = { ...req.body };
    delete updateFields.password;

    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      updateFields,
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!updatedCustomer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    res.status(200).json({
      success: true,
      message: "Customer updated successfully",
      data: updatedCustomer,
    });
  } catch (error) {
    console.error("Error updating customer:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.toggleCustomerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findById(id);

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    customer.isActive = !customer.isActive;
    await customer.save();

    res.status(200).json({
      success: true,
      message: `Customer has been ${
        customer.isActive ? "activated" : "deactivated"
      }`,
      data: customer,
    });
  } catch (error) {
    console.error("Error toggling customer status:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Customer.findByIdAndDelete(id);

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    res.status(200).json({
      success: true,
      message: "Customer deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting customer:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
