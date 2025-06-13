const jwt = require("jsonwebtoken");
const { Users } = require("../models/userModel");

const authorization = (req, res, next) => {
  try {
    const { token } = req.headers;
    if (!token) throw new Error("Unauthorised Access");
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(401).json({
          status: "error",
          error: err.message,
        });
      }
      const email = decoded.email;
      const data = await Users.findOne({ where: { email: email } });
      if (data == null) {
        return res.status(401).json({
          status: "error",
          error: "Unauthorised Access",
        });
      }

      req.user = {
        user_id: data.user_id,
        email: data.email,
      };
      next();
    });
  } catch (error) {
    res.status(401).json({
      status: "error",
      error: "Unauthorised Access",
    });
  }
};

module.exports = { authorization };
