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
  createLivestockValidation,
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
const NAIRA_CONVERSION = 100;

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
          role: "user",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { transaction: t }
      );
      // Create wallet for the user
      await Wallets.create(
        {
          wallet_id: uuidv4(),
          user_id: userTemp.user_id,
          balance: 0,
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
      { _id: uuidv4(), email: email, role: user.role },
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

const getAvailableLivestocks = async (req, res) => {
  try {
    const { user_id } = req.user;
    const livestocks = await Livestocks.findAll({
      where: { available: true },
      attributes: ["livestock_id", "name", "price", "weight", "description"],
    });
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
//     if (error) {
//       return res.status(400).json({ message: error.details[0].message });
//     }

//     const { livestock_id, totalSlot, slotTaken, paymentMethod, groupName, paymentReference } = req.body;
//     const { user_id } = req.user; // passed from the aUTH

//     // Validate slot count
//     if (slotTaken > totalSlot)
//       throw new Error("Slot taken cannot be greater than total slot");

//     // Check if livestock is available
//     const livestock = await Livestocks.findOne({
//       where: { livestock_id, available: true },
//     });
//     if (livestock == null) throw new Error("Livestock not available");

//     // Calculate slot price
//     const totalPrice = parseFloat(livestock.price);
//     const slotPrice = Math.ceil(totalPrice / totalSlot);
//     const finalSlotPrice = slotPrice * slotTaken;

//     if (slotPrice <= 0) throw new Error("Invalid slot price");

//     // let paymentReference = null;
//     // Check wallet if payment method is WALLET
//     if (paymentMethod === paymentMeans.WALLET) {
//       const Transaction_ref = await debitWallet(
//         (amount = finalSlotPrice),
//         user_id,
//         email,
//         `wallet Debit for ${groupName} purchase and ${slotTaken} taken`
//       );
//       if (Transaction_ref == null) throw new Error("Insufficeint Balance");
//       paymentReference = Transaction_ref;
//     } else if (paymentMethod === paymentMeans.OTHERS) {
//       const { paymentReference } = req.body;
//       if (!paymentReference) throw new Error("Invalid Reference");
//       const transaction = await checkTransactionStatus(reference); //checked if the transaction is not used yet on the system

//       if (transaction != null) throw new Error("Invalid transaction");
//       const verifyPaymentReference = await verifyPayment(reference);
//       if (verifyPaymentReference.data.data.status != "success")
//         throw new Error("Invalid transaction or payment failed");
//       paymentReference = reference;
//     } else {
//       return res.status(400).json({ message: "Invalid payment Method" });
//     }

//     // Proceed to create the group here

//     const newGroup = await CreateGroups.create({
//       livestock_id,
//       totalSlot,
//       slotTaken,
//       created_by: user_id,
//       paymentMethod,
//       paymentReference,
//       slotPrice,
//       groupName,
//       status: slotTaken === totalSlot ? "completed" : "active",
//     });

//     return res.status(201).json({
//       message: "Group created successfully",
//       newGroup,
//     });
//   } catch (error) {
//     return res
//       .status(500)
//       .json({ message: error.message || "Internal server error" });
//   }
// };

const createGroup = async (req, res) => {
  try {
    // Validate request body
    const { error, value } = createGroupValidation(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const {
      livestock_id,
      totalSlot,
      slotTaken,
      paymentMethod,
      groupName,
      paymentReference,
    } = req.body;
    const { user_id, email } = req.user; // Assuming email is available in req.user

    // Validate slot count
    if (slotTaken > totalSlot) {
      return res
        .status(400)
        .json({ message: "Slot taken cannot be greater than total slot" });
    }

    // Check if livestock is available
    const livestock = await Livestocks.findOne({
      where: { livestock_id, available: true },
    });
    if (!livestock) {
      return res.status(404).json({ message: "Livestock not available" });
    }

    // Calculate slot price
    const totalPrice = parseFloat(livestock.price);
    const slotPrice = Math.ceil(totalPrice / totalSlot);
    const finalSlotPrice = slotPrice * slotTaken;

    if (slotPrice <= 0) {
      return res.status(400).json({ message: "Invalid slot price" });
    }

    let finalPaymentReference = null;

    // Handle payment method
    if (paymentMethod === paymentMeans.WALLET) {
      // Debit wallet
      const transactionRef = await debitWallet(
        finalSlotPrice,
        user_id,
        email,
        `Wallet Debit for ${groupName} purchase, ${slotTaken} slots`
      );
      if (!transactionRef) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
      finalPaymentReference = transactionRef;

      // Save wallet transaction
      await Transactions.create({
        transaction_id: uuidv4(),
        email,
        description: `Wallet Debit for ${groupName} purchase, ${slotTaken} slots`,
        transaction_type: "debit",
        reference: finalPaymentReference,
        user_id,
        amount: finalSlotPrice,
        status: "success",
        payment_means: paymentMethod,
      });
    } else if (paymentMethod === paymentMeans.OTHERS) {
      if (!paymentReference) {
        // Initialize new payment
        const paymentResponse = await initailizePayment(email, finalSlotPrice);
        const { authorization_url, reference } = paymentResponse.data.data;

        return res.status(200).json({
          message: "Payment initialization successful",
          paymentLink: authorization_url,
          paymentReference: reference,
        });
      }

      // Verify existing payment reference
      const existingTransaction = await checkTransactionStatus(
        paymentReference
      );
      if (existingTransaction) {
        return res
          .status(400)
          .json({ message: "Payment reference already used" });
      }

      const verification = await verifyPayment(paymentReference);
      if (verification.data.data.status !== "success") {
        return res.status(400).json({ message: "Payment failed" });
      }

      // Validate payment amount
      // const paidAmount = verification.data.data.amount / 100; // Convert from kobo
      // if (paidAmount !== finalSlotPrice) {
      //   return res
      //     .status(400)
      //     .json({ message: "Paid amount does not match expected amount" });
      // }

      finalPaymentReference = paymentReference;

      // Save other transaction
      await Transactions.create({
        transaction_id: uuidv4(),
        email,
        description: `Wallet Debit for ${groupName} purchase, ${slotTaken} slots`,
        transaction_type: "debit",
        reference: finalPaymentReference,
        user_id,
        amount: finalSlotPrice,
        status: "success",
        payment_means: paymentMethod,
      });
    } else {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    // Check group name uniqueness (optional, uncomment if needed)
    /*
    const existingGroup = await CreateGroups.findOne({
      where: { groupName, livestock_id },
    });
    if (existingGroup) {
      return res.status(400).json({ message: "Group name already exists for this livestock" });
    }
    */

    // Create the group
    const newGroup = await CreateGroups.create({
      livestock_id,
      totalSlot,
      slotTaken,
      created_by: user_id,
      paymentMethod,
      paymentReference: finalPaymentReference,
      slotPrice,
      groupName,
      status: slotTaken === totalSlot ? "completed" : "active",
    });

    // Update transaction with group_id (optional, for tracking)
    await Transactions.update(
      { group_id: newGroup.id },
      { where: { reference: finalPaymentReference } }
    );

    return res.status(201).json({
      message: "Group created successfully",
      group: newGroup,
    });
  } catch (error) {
    console.error("Error in createGroup:", error);
    return res.status(500).json({
      message: error.message || "Internal server error",
    });
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

    console.log(
      "Processing wallet funding for user_id:",
      user_id,
      "with reference:",
      reference
    );

    // Check transaction status
    const transaction = await checkTransactionStatus(reference);
    console.log("Transaction status check result:", transaction);
    if (transaction != null) throw new Error("invalid transaction");

    const response = await verifyPayment(reference);
    console.log("Paystack verification response:", response.data);
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
          transaction_type: "credit",
          payment_means: "others",
          amount: response.data.data.amount / NAIRA_CONVERSION,
          status: "success",
        },
        { transaction: t }
      );
      const updateAmount =
        Number(getWallet.balance) + response.data.data.amount / NAIRA_CONVERSION;
        console.log("Updating wallet balance to:", updateAmount, "for user_id:", user_id);
      await Wallets.update(
        { balance: updateAmount },
        { where: { user_id: user_id } },
        { transaction: t }
      );
    });

    res.status(200).json({
      status: "success",
      message: "Wallet successfully funded",
    });
  } catch (error) {
    console.error("Error in completWalletFunding:", error);
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

const createLivestock = async (req, res) => {
  try {
    const { error, value } = createLivestockValidation(req.body);
    if (error)
      return res.status(400).json({ message: error.details[0].message });
    const { name, price, description, available, livestock_id, imageUrl } =
      req.body;
    const { user_id, role } = req.user;

    //check if user is admin
    if (role !== "admin")
      return res
        .status(400)
        .json({ message: "Only admin can create livestock" });
    //check if livestock with the same name already exists
    const existingLivestock = await Livestocks.findOne({
      where: { name: name },
    });
    if (existingLivestock) {
      return res
        .status(400)
        .json({ message: "Livestock with the same name already exists" });
    }
    const newLivestock = await Livestocks.create({
      livestock_id: uuidv4(),
      name,
      price,
      description,
      available,
      user_id,
      imageUrl,
    });
    return res.status(200).json({
      message: "Livestock created successfully",
      livestock: newLivestock,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
module.exports = {
  createUser,
  verifyEmail,
  login,
  getUser,
  updateUser,
  getSingleLivestock,
  getAvailableLivestocks,
  createGroup,
  startWalletFunding,
  completWalletFunding,
  createLivestock,
};
