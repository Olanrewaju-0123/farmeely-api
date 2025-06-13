const { optional } = require("joi");
const sequelize = require("../config/sequelize");
const { Users } = require("../models/userModel");
const { CreateGroups } = require("../models/createGroupModel");
const {
  hashPassword,
  generateOtp,
  debitWallet,
  checkTransactionStatus,
} = require("../utils");
const {
  createUserValidation,
  updateUserValidation,
  createGroupValidation,
} = require("../validations/userValidation");
const bcrypt = require("bcrypt");
const { TemporaryUsers } = require("../models/userTemp");
const { Otps } = require("../models/otpModel");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const { Livestocks } = require("../models/livestockModel");
const { paymentMeans } = require("../enum/index");
const { Wallets } = require("../models/walletModel");
const {
  initailizePayment,
  verifyPayment,
} = require("../services/paymentGateway");
const { Transactions } = require("../models/transactionModel");

const createUser = async (req, res) => {
  try {
    const {
      surname,
      othernames,
      email,
      password,
      phoneNumber,
      location,
      address,
    } = req.body;
    const { error } = createUserValidation(req.body);
    if (error) throw new Error(error.details[0].message);

    const checkIfEmailExist = await Users.findOne({ where: { email: email } });
    if (checkIfEmailExist) throw new Error("Email already exist");

    const [hash, salt] = await hashPassword(password);
    await TemporaryUsers.create({
      user_id: uuidv4(),
      surname: surname,
      othernames: othernames,
      email: email,
      hash: hash,
      salt: salt,
      phoneNumber: phoneNumber,
      location: location,
      address: address,
      is_email_verified: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    // generate otp
    const otp = generateOtp();
    await Otps.create({
      email: email,
      otp: otp,
    });

    res.status(200).json({
      status: "success",
      message: "An OTP has been sent to your email",
    });
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ error: error.message });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.params;
    const checkIfEmailAndOtpExist = await Otps.findOne({
      where: { email: email, otp: otp },
    });
    if (checkIfEmailAndOtpExist == null)
      throw new Error("Invalid or Expired otp");

    // Get all the data by email from userTemp table
    const userTemp = await TemporaryUsers.findOne({ where: { email: email } });
    if (userTemp == null) throw new Error("user record not found");

    // start a database transaction
    const transaction = await sequelize.transaction(async (t) => {
      await Users.create(
        {
          user_id: userTemp.user_id,
          surname: userTemp.surname,
          othernames: userTemp.othernames,
          email: userTemp.email,
          hash: userTemp.hash,
          salt: userTemp.salt,
          phoneNumber: userTemp.phoneNumber,
          location: userTemp.location,
          address: userTemp.address,
          is_email_verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { transaction: t }
      );
    });

    await Otps.destroy({ where: { email: email } });
    await TemporaryUsers.destroy({ where: { email: email } });

    res.status(200).json({
      status: "success",
      message: "Email Verified and User created successfully",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email.trim() || !password.trim())
      throw new Error("Email and password are required");
    const user = await Users.findOne({ where: { email: email } });
    if (user == null) throw new Error("Invalid email or password");
    const credentialsMatch = await bcrypt.compare(password, user.hash);
    if (!credentialsMatch) throw new Error("Invalid email or password");
    const token = jwt.sign(
      { _id: uuidv4(), email: email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.setHeader("access_token", token);

    res.status(200).json({
      status: "success",
      message: "User logged in successfully",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message,
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const { user_id } = req.user;
    const data = req.body;
    const { error } = updateUserValidation(data);
    if (error != undefined) throw new Error(error.details[0].message);
    await Users.update(req.body, {
      where: {
        user_id: user_id,
      },
    });

    return res.status(200).json({
      status: "success",
      message: "User updated successfully",
      data: data,
    });
  } catch (error) {
    console.log("error", error);
    res.status(400).json({
      status: "error",
      error: error.message,
    });
  }
};

const getUser = async (req, res) => {
  try {
    const { user_id } = req.user;
    const user = await Users.findOne({
      where: { user_id: user_id },
      attributes: {
        exclude: ["sn", "hash", "salt", "user_id", "created_at", "updated_at"],
      },
    });
    if (user == null) throw new Error("User does not exist");

    res.status(200).json({
      status: "success",
      message: "User found",
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

const getAllLivestock = async (req, res) => {
  try {
    const { user_id } = req.user;
    const livestocks = await Livestocks.findAll();
    res.status(200).json({
      status: "success",
      data: livestocks,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

const getSingleLivestock = async (req, res) => {
  try {
    const { livestock_id } = req.params;
    const { user_id } = req.user;
    if (sn == null) throw new Error("Livestock not found");
    const livestock = await Livestocks.findByPk({
      where: { livestock_id: livestock_id, user_id: user_id, available: true },
    });
    if (livestock == null) throw new Error("Livestock not found");
    res.status(200).json({
      status: "success",
      data: livestock,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

// const createGroup = async (req, res) => {
//   try {
//     const { error, value } = createGroupValidation.validate(req.body);
//     if (error) throw new Error(error.details[0].message);
//     const { livestock_id, totalSlot, slotTaken, paymentMethod } = value;
//     const { user_id } = req.user;

//     // Check if slot taken is greater than total slot
//     if (slotTaken > totalSlot)
//       throw new Error("Slot taken cannot be greater than total slot");

//     // Check if livestock is available
//     const livestock = await Livestocks.findOne({
//       where: { livestock_id: livestock_id, available: true },
//     });
//     if (livestock == null) throw new Error("Livestock not available");

//     // Check if slot price is valid
//     const totalPrice = parseFloat(livestock.price);
//     const slotPrice = Math.ceil(totalPrice / totalSlot);
//     const finalSlotPrice = slotPrice * slotTaken;
//     if (slotPrice <= 0) throw new Error("Invalid slot price");

//     // check wallet balance for wallet payment
//     paymentReference = null
//     if(paymentMethod === paymentMeans.WALLET) {
//       const wallet = await Wallets.findOne({where: {user_id}})
//       if(wallet ==null) throw new Error("wallet not found. Please set up a wallet")
//     }
//   if(wallet.balance)
//   } catch (error){

//   }

// };

const createGroup = async (req, res) => {
  try {
    const { error, value } = createGroupValidation.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { livestock_id, totalSlot, slotTaken, paymentMethod, groupName } = req.body;
    const { user_id } = req.user; // passed from the aUTH

    // Validate slot count
    if (slotTaken > totalSlot)
      throw new Error("Slot taken cannot be greater than total slot");

    // Check if livestock is available
    const livestock = await Livestocks.findOne({
      where: { livestock_id, available: true },
    });
    if (!livestock) throw new Error("Livestock not available");

    // Calculate slot price
    const totalPrice = parseFloat(livestock.price);
    const slotPrice = Math.ceil(totalPrice / totalSlot);
    const finalSlotPrice = slotPrice * slotTaken;

    if (slotPrice <= 0) throw new Error("Invalid slot price");

    let paymentReference = null;
    // Check wallet if payment method is WALLET
    if (paymentMethod === paymentMeans.WALLET) {
      const Transaction_ref = await debitWallet(
        (amount = finalSlotPrice),
        user_id,
        email,
        `wallet Debit for ${groupName} purchase and ${slotTaken} taken`
      );
      if (Transaction_ref == null) throw new Error("Insufficeint Balance");
      paymentReference = Transaction_ref;
    } else if (paymentMethod === paymentMeans.OTHERS) {
      const { reference } = req.body;
      if (!reference) throw new Error("Invalid Reference");
      const transaction = await checkTransactionStatus(reference); //checked if the transaction is not used yet on the system

      if (transaction != null) throw new Error("Invalid transaction");
      const verifyPaymentReference = await verifyPayment(reference);
      if (verifyPaymentReference.data.data.status != "success")
        throw new Error("Invalid transaction or payment failed");
      paymentReference = reference;
    } else {
      return res.status(400).json({ message: "Invalid payment Method" });
    }

    // Proceed to create the group here

    const newGroup = await CreateGroups.create({
      livestock_id,
      totalSlot,
      slotTaken,
      created_by: user_id,
      paymentMethod,
      paymentReference,
      slotPrice,
      groupName,
      status: slotTaken === totalSlot ? "completed" : "active",
    });

    return res.status(201).json({
      message: "Group created successfully",
      newGroup,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: error.message || "Internal server error" });
  }
};

const startWalletFunding = async (req, res) => {
  try {
    const { email, user_id } = req.user; // passed from the auth
    const { amount } = req.body;
    if (amount < 1000) throw new Error("Amount must be greater than 1000");
    const response = await initailizePayment(email, amount);

    res.status(200).json({
      status: "success",
      message: "Payment initialized successfully",
      data: {
        payment_url: response.data.data.authorization_url,
        access_code: response.data.data.reference,
      },
    });
  } catch (error) {
    res.status(400).json({
      status: false,
      message: error.message,
    });
  }
};

const completWalletFunding = async (req, res) => {
  try {
    const { user_id, email } = req.user; // passed from the Auth
    const { reference } = req.params;

    const transaction = await checkTransactionStatus(reference);
    if (transaction != null) throw new Error("invalid transaction");

    const response = await verifyPayment(reference);
    if (response.data.data.status != "success")
      throw new Error("Invalid transaction or payment failed");
    await sequelize.transaction(async (t) => {
      const getWallet = await Wallets.findOne(
        { where: { user_id: user_id } },
        { transaction: t }
      );

      await Transactions.create(
        {
          transaction_id: uuidv4(),
          user_id: user_id,
          wallet_id: getWallet.wallet_id,
          payment_reference: reference,
          email: email,
          description: "wallet funding",
          transction_type: "credit",
          payment_means: "others",
          amount: response.data.data.amount / NAIR_CONVERSION,
          status: "completed",
        },
        { transaction: t }
      );
      const updateAmount =
        Number(getWallet.amount) + response.data.data.amount / NAIRA_CONVERSION;
      await Wallets.update(
        { amount: updateAmount },
        { where: { user_id: user_id } },
        { transaction: t }
      );
    });

    res.status(200).json({
      status: "success",
      message: "Wallet successfully funded",
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

const createLivestock = async (req, res) => {
  try {
  } catch (error) {}
};
module.exports = {
  createUser,
  verifyEmail,
  login,
  getUser,
  updateUser,
  getSingleLivestock,
  getAllLivestock,
  createGroup,
  startWalletFunding,
  completWalletFunding,
  createLivestock,
};
