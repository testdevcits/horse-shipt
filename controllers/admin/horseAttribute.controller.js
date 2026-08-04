const { apiResponse } = require("../../responses/api.response");
const HorseColor = require("../../models/admin/HorseColor");
const HorseSex = require("../../models/admin/HorseSex");

const DEFAULT_COLORS = [
  "Bay",
  "Dark Bay",
  "Blood Bay",
  "Black",
  "Faded Black",
  "Chestnut",
  "Liver Chestnut",
  "Light Chestnut",
  "Sorrel",
  "Grey",
  "Dapple Grey",
  "Flea-bitten Grey",
  "White",
  "Palomino",
  "Golden Palomino",
  "Buckskin",
  "Dun",
  "Red Dun",
  "Grullo",
  "Roan",
  "Red Roan",
  "Blue Roan",
  "Strawberry Roan",
  "Pinto",
  "Tobiano",
  "Overo",
  "Tovero",
  "Appaloosa",
  "Leopard Appaloosa",
  "Snowflake Appaloosa",
  "Blanket Appaloosa",
  "Cremello",
  "Perlino",
  "Smoky Black",
  "Champagne",
  "Gold Champagne",
  "Amber Champagne",
  "Silver Dapple",
  "Brindle",
  "Sabino",
  "Splash White",
  "Rabicano",
  "Other",
];

const DEFAULT_SEXES = ["Stallion", "Gelding", "Mare", "Colt", "Filly"];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const makeAttributeController = ({ Model, singular, defaultItems, otherNames = [] }) => {
  const isOtherName = (name) =>
    otherNames.some((item) => item.toLowerCase() === name.toLowerCase());

  const ensureDefaults = async () => {
    const activeCount = await Model.countDocuments({ isActive: true });
    if (activeCount > 0) return;

    await Promise.all(
      defaultItems.map((name) =>
        Model.findOneAndUpdate(
          { name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" } },
          {
            $set: {
              name,
              isActive: true,
              isOther: isOtherName(name),
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
      )
    );
  };

  const create = async (req, res) => {
    try {
      let { name } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ message: `${singular} name is required` });
      }

      name = name.trim();

      const exists = await Model.findOne({
        name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
        isActive: true,
      });

      if (exists) {
        return res.status(400).json({ message: `${singular} already exists` });
      }

      const inactiveItem = await Model.findOne({
        name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
        isActive: false,
      });

      if (inactiveItem) {
        inactiveItem.name = name;
        inactiveItem.isActive = true;
        inactiveItem.isOther = isOtherName(name);
        await inactiveItem.save();

        return res.status(201).json({
          message: `${singular} created successfully`,
          data: inactiveItem,
        });
      }

      const item = await Model.create({
        name,
        isOther: isOtherName(name),
      });

      return res.status(201).json({
        message: `${singular} created successfully`,
        data: item,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: apiResponse.SERVER_ERROR });
    }
  };

  const list = async (req, res) => {
    try {
      await ensureDefaults();

      let { page = 1, limit = 10, showInactive = false } = req.query;
      page = parseInt(page);
      limit = parseInt(limit);

      const filter = showInactive === "true" ? {} : { isActive: true };
      const total = await Model.countDocuments(filter);
      const items = await Model.find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit);
      const totalPages = Math.ceil(total / limit) || 1;

      return res.status(200).json({
        success: true,
        count: items.length,
        total,
        page,
        limit,
        totalPages,
        pagination: {
          page,
          limit,
          total,
          totalRecords: total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        data: items,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: apiResponse.SERVER_ERROR });
    }
  };

  const listAll = async (req, res) => {
    try {
      await ensureDefaults();

      const items = await Model.find({ isActive: true }).sort({ name: 1 });

      return res.status(200).json({
        success: true,
        count: items.length,
        data: items,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: apiResponse.SERVER_ERROR });
    }
  };

  const update = async (req, res) => {
    try {
      let { name } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ message: `${singular} name is required` });
      }

      name = name.trim();

      const item = await Model.findById(req.params.id);
      if (!item) {
        return res.status(404).json({ message: `${singular} not found` });
      }

      const duplicate = await Model.findOne({
        _id: { $ne: item._id },
        name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
        isActive: true,
      });

      if (duplicate) {
        return res.status(400).json({ message: `${singular} already exists` });
      }

      item.name = name;
      item.isOther = isOtherName(name);
      await item.save();

      return res.status(200).json({
        message: `${singular} updated successfully`,
        data: item,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: apiResponse.SERVER_ERROR });
    }
  };

  const remove = async (req, res) => {
    try {
      const item = await Model.findById(req.params.id);

      if (!item) {
        return res.status(404).json({ message: `${singular} not found` });
      }

      item.isActive = false;
      await item.save();

      return res.status(200).json({
        message: `${singular} deleted successfully`,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: apiResponse.SERVER_ERROR });
    }
  };

  const updateStatus = async (req, res) => {
    try {
      const { isActive } = req.body;

      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          message: apiResponse.ISACTIVE_MUST_BE_TRUE_OR_FALSE,
        });
      }

      const item = await Model.findById(req.params.id);

      if (!item) {
        return res.status(404).json({ message: `${singular} not found` });
      }

      item.isActive = isActive;
      await item.save();

      return res.status(200).json({
        message: `${singular} ${isActive ? "activated" : "deactivated"} successfully`,
        data: item,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: apiResponse.SERVER_ERROR });
    }
  };

  return {
    create,
    list,
    listAll,
    update,
    remove,
    updateStatus,
  };
};

module.exports = {
  colorController: makeAttributeController({
    Model: HorseColor,
    singular: "Color",
    defaultItems: DEFAULT_COLORS,
    otherNames: ["Other"],
  }),
  sexController: makeAttributeController({
    Model: HorseSex,
    singular: "Sex",
    defaultItems: DEFAULT_SEXES,
  }),
};
