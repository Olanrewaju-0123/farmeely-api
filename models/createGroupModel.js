const { Sequelize, DataTypes } = require("sequelize");
const sequelize = require("../config/sequelize");
const { Livestocks } = require("./livestockModel");


const CreateGroups = sequelize.define(
  "createGroup",
  {
    sn: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    group_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    livestock_id: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: "Livestock",
        key: "livestock_id",
      },
    },
    created_by: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: "Users",
        key: "user_id",
      },
    },
    totalSlot: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    slotTaken: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    slotPrice: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    totalSlotLeft: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    totalSlotPriceLeft: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    finalSlotPriceTaken: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    paymentReference: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("pending", "active", "completed", "cancelled"),
      defaultValue: "pending",
    },
    paymentMethod: {
      type: DataTypes.ENUM("wallet", "others"),
      allowNull: false,
    },
    groupName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW,
    },
  },
  {
    timestamps: false,
    createdAt: false,
    updatedAt: false,
  }
);

// Define associations
// CreateGroups.belongsTo(Livestocks, { foreignKey: "livestock_id", targetKey: "livestock_id", as: "livestock" })
module.exports = { CreateGroups };
