const express = require("express");
const router = express.Router();
router.use((req, res, next) => {
  console.log("User Router: Request received for path:", req.path);
  next();
});
const {
  createUser,
  verifyEmail,
  resendOtp,
  login,
  updateUser,
  getUser,
  getAvailableLivestocks,
  startWalletFunding,
  completWalletFunding,
  getWalletBalance,
  createLivestock,
  startForgotPassword,
  completeForgotPassword,
  startCreateGroup,
  completeCreateGroup,
  startJoinGroup,
  completeJoinGroup,
  getActiveGroups,
  getMyGroups,
  getWalletTransactions,
  getGroupDetails,
} = require("../controllers/userCtrl");
const { authorization } = require("../middleware/authorisation");

router.post("/users/signup", createUser);
router.post("/users/login", login);
router.patch("/users/verify-email/:email/:otp", verifyEmail);
router.patch("/users/resend-otp/:email", resendOtp);
router.patch("/users/forgot-password/:email", startForgotPassword);
router.post("/users/complete", completeForgotPassword);
router.patch("/users/profile", authorization, updateUser);
router.get("/users/profile", authorization, getUser);

// Get all available livestock
router.get("/livestocks", authorization, getAvailableLivestocks);

// create a new livestock entry (Admin)
router.post("/livestocks", authorization, createLivestock);

// Start Wallet Funding
router.post("/wallet/funding/start", authorization, startWalletFunding);

// complete wallet funding
router.post(
  "/wallet/fund/complete/:reference",
  authorization,
  completWalletFunding
);
router.get("/wallet/balance", authorization, getWalletBalance);

router.get("/wallet/transactions", authorization, getWalletTransactions);

// Routes for fetching groups
router.get("/groups/active", authorization, getActiveGroups);
// Route for active groups
router.get("/groups/my-groups", authorization, getMyGroups);

//create a group
//router.post("/groups", authorization, createGroup)
router.post("/groups/create/start", authorization, startCreateGroup);
router.post("/groups/create/complete", authorization, completeCreateGroup);

router.post("/groups/:groupId/join/start", authorization, startJoinGroup);
router.post(
  "/groups/join/complete/:paymentReference",
  authorization,
  completeJoinGroup
);

router.get("/groups/:groupId", authorization, getGroupDetails);

module.exports = router;
