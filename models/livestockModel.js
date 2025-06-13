const { Sequelize, DataTypes } = require("sequelize");
const sequelize = require("../config/sequelize");

const Livestocks = sequelize.define(
  "livestock",
  {
    sn: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    livestock_id:{
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    breed: {
      type: DataTypes.STRING,
    },
    weight: {
      type: DataTypes.FLOAT,
    },
    price: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    imageUrl: {
      type: DataTypes.STRING,
    },
    description: {
      type: DataTypes.TEXT,
    },
    available: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
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

module.exports = { Livestocks };
