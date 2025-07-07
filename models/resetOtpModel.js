const { Sequelize, DataTypes } = require("sequelize");
const sequelize = require("../config/sequelize");

const ResetOtps = sequelize.define(
  "ResetOtp",
  {
    sn: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: "users", // real users table
        key: "email",
      },
    },
    otp: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    expires_at: {
      type: DataTypes.DATE,
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
module.exports = { ResetOtps };
