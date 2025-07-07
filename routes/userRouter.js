const express = require("express");
const router = express.Router();
const {
  createUser,
  verifyEmail,
  resendOtp,
  login,
  updateUser,
  getUser,
  getAvailableLivestocks,
  getSingleLivestock,
  createGroup,
  joinGroup,
  startWalletFunding,
  completWalletFunding,
  createLivestock,
  startForgetPassword,
  completeForgetPassword,
  completePayment


} = require("../controllers/userCtrl");
const { authorization } = require("../middleware/authorisation");

router.post("/user", createUser);
router.patch("/verify-email/:email/:otp", verifyEmail);
router.patch("/resend-otp/:email", resendOtp)
router.post("/user/login", login);
router.patch("/user", authorization, updateUser);
router.get("/user", authorization, getUser);
router.patch("/user/forget-password/:email", startForgetPassword);
router.post("/user/forget-password/complete", completeForgetPassword);

// Get all available livestock
router.get("/livestocks", authorization, getAvailableLivestocks);

// Start Wallet Funding
router.post('/user/wallet-funding/start',authorization, startWalletFunding);

// complete wallet funding
router.post('/user/wallet-funding/complete/:reference', authorization, completWalletFunding)

// create a new livestock entry (Admin)
router.post('/livestock', authorization, createLivestock)

//create a group
router.post("/groups", authorization, createGroup)

//Join a Group
router.post("/groups/:groupId/join", authorization, joinGroup)

router.post("/complete-payment", completePayment);

// Get a single livestock by ID
// router.get('/livestock', getSingleLivestock)






// Delete a livestock entry
// router.delete('/livestock/:id', deleteLivestock)



module.exports = router;
