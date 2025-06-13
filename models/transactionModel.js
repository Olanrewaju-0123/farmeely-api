const { Sequelize, DataTypes } = require("sequelize");
const sequelize = require("../config/sequelize");

const Transactions = sequelize.define(
  "Transaction",
  {
    sn: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    transaction_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    wallet_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    transaction_type: {
      type: DataTypes.ENUM,
      values: ["credit", "debit"],
    },
    payment_means: {
      type: DataTypes.ENUM,
      values: ["wallet", "others"],
    },
    status: {
      type: DataTypes.ENUM,
      values: ["pending", "success", "failed"],
      allowNull: false,
      defaultValue: "pending",
    },
    payment_reference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    timestamps: false,
    createdAt: false,
    updatedAt: false,
  }
);

module.exports = {
  Transactions,
};
