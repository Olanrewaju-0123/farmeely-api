require("dotenv").config()
const express = require("express")
const cors = require("cors")
const app = express()
const sequelize = require("./config/sequelize")
const port = process.env.APP_PORT || 2025
const UserRoutes = require("./routes/userRouter")
const crypto = require("crypto")

// IMPORTANT: Import all models here to ensure they are loaded
// before defineAssociations() is called.
const { Users } = require("./models/userModel")
const { UserTemp } = require("./models/userTemp")
const { Otp } = require("./models/otpModel")
const { ResetOtp } = require("./models/resetOtpModel")
const { Wallets } = require("./models/walletModel")
const { Livestocks } = require("./models/livestockModel")
const { CreateGroups } = require("./models/createGroupModel")
const { joinGroups } = require("./models/joinGroupModel")
const { PendingPayments } = require("./models/pendingPaymentModel")
const { Transactions } = require("./models/transactionModel")

// Now import and call the association function AFTER all models are imported
const defineAssociations = require("./models/associations")
defineAssociations() // This will now run after all models are loaded

// --- Paystack Webhook Endpoint ---
app.post(
  "/paystack-webhook",
  express.raw({ type: "application/json" }), // Use express.raw to get the raw body as a Buffer
  (req, res) => {
    const secret = process.env.PAYSTACK_SECRET_KEY
    const hash = crypto.createHmac("sha512", secret).update(req.body).digest("hex")

    if (hash !== req.headers["x-paystack-signature"]) {
      console.error("Webhook signature verification failed!")
      return res.status(400).send("Invalid signature")
    }

    const event = JSON.parse(req.body.toString())

    console.log("Received Paystack Webhook Event:", event.event)
    if (event.event === "charge.success") {
      const reference = event.data.reference
      const amount = event.data.amount / 100
      const status = event.data.status
      const email = event.data.customer.email
      console.log(`Charge Success: Reference ${reference}, Amount ${amount}, Status ${status}, Email ${email}`)
    }
    res.status(200).send("Webhook received")
  },
)
// --- END NEW ---

// 1. CORS Middleware - Should be near the top
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "access_token"],
    exposedHeaders: ["access_token"],
    credentials: true,
  }),
)

// 2. Body Parser Middleware - Essential for parsing JSON request bodies
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 3. Route Handlers - All your routes should come after body parsers
app.use(UserRoutes) // Mount your user routes

// 4. 404 Not Found Handler - This should be the LAST route/middleware before your general error handler
app.use((req, res, next) => {
  res.status(404).json({ status: "error", message: "Not Found" })
})

// 5. General Error Handling Middleware - This should be the very last middleware
app.use((err, req, res, next) => {
  console.error(err.stack) // Log the error stack for debugging
  res.status(500).json({ status: "error", message: "Internal Server Error" }) // Send JSON response
})

const connection = async () => {
  try {
    await sequelize.authenticate()
    console.log("Connection has been established successfully.")

    // You had a temporary block for dropping tables in the previous app.js.
    // I'm keeping the `sequelize.sync()` here. If you need to force-drop tables
    // for development, uncomment the `force: true` or the `SET FOREIGN_KEY_CHECKS` block.
    // For production, you'd typically use migrations or `sequelize.sync()` without `force: true`.

    // await sequelize.query("SET FOREIGN_KEY_CHECKS = 0") // Disable foreign key checks
    // await joinGroups.drop({ cascade: true })
    // await PendingPayments.drop({ cascade: true })
    // await Transactions.drop({ cascade: true })
    // await Otp.drop({ cascade: true })
    // await ResetOtp.drop({ cascade: true })
    // await Wallets.drop({ cascade: true })
    // await CreateGroups.drop({ cascade: true })
    // await Livestocks.drop({ cascade: true })
    // await UserTemp.drop({ cascade: true })
    // await Users.drop({ cascade: true })
    // await sequelize.query("SET FOREIGN_KEY_CHECKS = 1") // Re-enable foreign key checks

    await sequelize.sync() // Use this for regular syncing without dropping data
    console.log("Tables synced successfully.")

    app.listen(port, () => {
      console.log(`Server running on port ${port}`)
    })
  } catch (error) {
    console.error("Unable to connect to the database:", error)
    if (error.parent) {
      console.error("Database Error Code:", error.parent.code)
      console.error("Database Error Message:", error.parent.sqlMessage)
      console.error("SQL Query:", error.parent.sql)
    }
    try {
      sequelize.query("SET FOREIGN_KEY_CHECKS = 1")
      console.log("Foreign key checks re-enabled after error.")
    } catch (reEnableError) {
      console.error("Failed to re-enable foreign key checks:", reEnableError)
    }
  }
}

connection()
