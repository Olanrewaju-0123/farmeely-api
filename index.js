require("dotenv").config();
const express = require("express");
const app = express();
const sequelize = require("./config/sequelize");
const port = process.env.APP_PORT || 3001;
const UserRoutes = require("./routes/userRouter");
const displayRoutes = require("express-routemap");

app.use(express.json());

app.use(UserRoutes);

const connection = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    console.log("Connection has been established successfully.");

    app.listen(port, () => {
      //    displayRoutes(app);
      //  displayRoutes(app, 'route-table.log');
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Unable to connect to the database:", error);
  }
};

connection();
