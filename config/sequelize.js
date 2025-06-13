const { Sequelize } = require("sequelize");
const DATABASE_NAME = process.env.DATABASE_NAME || "database";
const DATABASE_USER = process.env.DATABASE_USER || "username";
const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || "password";
const DATABASE_HOST = process.env.DATABASE_HOST || "localhost";
const DATABASE_PORT = process.env.DATABASE_PORT || 3001;

const sequelize = new (Sequelize)(DATABASE_NAME, DATABASE_USER, DATABASE_PASSWORD, {
    host: DATABASE_HOST,
    port: DATABASE_PORT,
    dialect: "mysql"
})

module.exports = sequelize;