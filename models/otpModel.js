const { Sequelize, DataTypes } = require("sequelize");
const sequelize = require("../config/sequelize");

const Otps = sequelize.define(
  "Otp",
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
        model: "TemporaryUsers",
        key: "email",
      },
    },
    otp: {
      type: DataTypes.STRING,
      allowNull: false,
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

module.exports = { Otps };
