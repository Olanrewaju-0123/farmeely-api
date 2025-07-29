const jwt = require("jsonwebtoken")
const { Users } = require("../models/userModel")

const authorization = (req, res, next) => {
  try {
    console.log("Authorization Middleware: Request path:", req.path)
    // Get the Authorization header
    const authHeader = req.headers.authorization

    // Check if the header exists and starts with 'Bearer '
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorised Access: No Bearer token provided")
    }

    // Extract the token by removing 'Bearer ' prefix
    const token = authHeader.split(" ")[1]

    if (!token) {
      throw new Error("Unauthorised Access: Token missing")
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(401).json({
          status: "error",
          error: err.message,
        })
      }

      const email = decoded.email
      const data = await Users.findOne({ where: { email: email } })

      if (data == null) {
        return res.status(401).json({
          status: "error",
          error: "Unauthorised Access: User not found",
        })
      }

      req.user = {
        user_id: data.user_id,
        email: data.email,
        role: data.role,
      }
      next()
    })
  } catch (error) {
    res.status(401).json({
      status: "error",
      error: error.message || "Unauthorised Access", // Use error.message for more specific errors
    })
  }
}

module.exports = { authorization }
