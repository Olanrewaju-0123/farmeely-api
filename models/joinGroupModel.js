const { Sequelize, DataTypes } = require("sequelize");
const sequelize = require("../config/sequelize");

const joinGroups = sequelize.define(
  "JoinGroup",
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
      references: {
        model: "CreateGroups",
        key: "group_id",
      },
    },
    user_id: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: "Users",
        key: "user_id",
      },
    },
    slots: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "approved"),
      defaultValue: "approved",
    },
    payment_reference: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
    },
    joined_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: false,
    createdAt: false,
    updatedAt: false,
  }
);

module.exports = { joinGroups };
