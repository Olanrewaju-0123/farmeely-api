const { Sequelize, DataTypes } = require("sequelize");
const sequelize = require("../config/sequelize");

const Wallets = sequelize.define(
    "Wallet",
    {
        sn: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        wallet_id: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        user_id: {
            type: DataTypes.STRING,
            allowNull: false,
            references: {
                model: "Users",
                key: "user_id",
            },
        },
        balance: {
            type: DataTypes.DECIMAL(10,2),
            allowNull: false,
            defaultValue: 0,
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
        Wallets
    }