const express = require("express");
const router = express.Router();
const {
  createUser,
  verifyEmail,
  login,
  updateUser,
  getUser,
  getAllLivestock,
  getSingleLivestock,
  createGroup,
  startWalletFunding,
  completWalletFunding,
  createLivestock
} = require("../controllers/userCtrl");
const { authorization } = require("../middleware/authorisation");

router.post("/user", createUser);
router.patch("/verify-email/:email/:otp", verifyEmail);
router.post("/user/login", login);
router.patch("/user", authorization, updateUser);
router.get("/user", authorization, getUser);

// Get all available livestock
router.get("/livestocks", getAllLivestock);

// Get a single livestock by ID
router.get('/livestock', getSingleLivestock)

router.post("/groups", createGroup)

// create a new livestock entry (Admin)
router.post('/livestock', createLivestock)

// Delete a livestock entry
// router.delete('/livestock/:id', deleteLivestock)

// Start Wallet Funding
router.post('/user/wallet-funding/start',authorization, startWalletFunding);

// complete wallet funding
router.post('/user/wallet-funding/start/:reference', authorization, completWalletFunding)

module.exports = router;
