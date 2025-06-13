const { Sequelize, DataTypes } = require("sequelize");
const sequelize = require("../config/sequelize");

const CreateGroups = sequelize.define(
  "createGroup",
  {
    sn: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    livestock_id: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'Livestocks',
        key: 'livestock_id',
      },
    },
    created_by: {
      type: DataTypes.STRING,
      allowNull: false,
      references:{
        model: 'Users',
        key:'user_id',
      },
    },
    totalSlots: {
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
    paymentReference: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    status: {
      type: DataTypes.ENUM("active", "completed", "cancelled"),
      defaultValue: "active",
    },
    paymentMethod: {
      type: DataTypes.ENUM("wallet", "others"),
      allowNull: false,
    },
    groupName:{
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

module.exports = { CreateGroups };
