const { Sequelize, DataTypes } = require("sequelize");
const sequelize = require("../config/sequelize");

const PendingPayments = sequelize.define("PendingPayment", {
  sn: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  paymentReference: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  actionType: {
    type: DataTypes.ENUM("CREATE_GROUP", "JOIN_GROUP"),
    allowNull: false,
  },
  meta: { type: DataTypes.JSON },
});

module.exports = {PendingPayments}