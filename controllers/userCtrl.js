const { optional } = require("joi");
const sequelize = require("../config/sequelize");
const { Users } = require("../models/userModel");
const { CreateGroups } = require("../models/createGroupModel");
const {
  hashPassword,
  generateOtp,
  debitWallet,
  checkTransactionStatus,
  startTransaction,
  completeTransaction,
} = require("../utils");
const {
  createUserValidation,
  updateUserValidation,
  forgotPasswordValidation,
  createGroupValidation,
  createLivestockValidation,
  joinGroupValidation,
  resetPasswordValidation,
  resendOtpValidation,
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
  verifyPayment,
  initializePayment,
} = require("../services/paymentGateway");
const { Transactions } = require("../models/transactionModel");
const { joinGroups } = require("../models/joinGroupModel");
const { PendingPayments } = require("../models/pendingPaymentModel");
const { ResetOtps } = require("../models/resetOtpModel");
const NAIRA_CONVERSION = 100;
const { sendEmail } = require("../services/email");

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
      // created_at: new Date().toISOString(),
      // updated_at: new Date().toISOString(),
    });
    // generate otp
    const { otp, expiresAt } = generateOtp();
    await Otps.create({
      email: email,
      otp: otp,
      expires_at: expiresAt,
    });

    sendEmail(email, message, "Verify Your Account");

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
          created_at: userTemp.created_at,
          // updated_at: new Date().toISOString(),
        },
        { transaction: t }
      );
      // Create wallet for the user
      await Wallets.create(
        {
          wallet_id: uuidv4(),
          user_id: userTemp.user_id,
          balance: 0,
          // created_at: new Date().toISOString(),
          // updated_at: new Date().toISOString(),
        },
        { transaction: t }
      );
    });

    await Otps.destroy({ where: { email: email } });
    await TemporaryUsers.destroy({ where: { email: email } });

    sendEmail(email, message, "Successful Verification");

    res.status(200).json({
      status: "success",
      message: "Email Verified and User created successfully",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const resendOtp = async (req, res) => {
  try {
    const { email } = req.params;
    const { error } = resendOtpValidation(req.params);

    const checkIfEmailAndOtpExist = await Otps.findOne({ where: { email } });
    if (checkIfEmailAndOtpExist == null) {
      throw new Error("");
    }

    const currentTime = new Date();
    const { expires_at } = checkIfEmailAndOtpExist.dataValues;
    if (currentTime < new Date(expires_at)) {
      throw new Error("OTP has expired");
    }

    const newOtp = checkIfEmailAndOtpExist.dataValues.otp;
    const { expiresAt } = generateOtp();
    await Otps.update({ expires_at: expiresAt }, { where: { email } });

    //send email
    sendEmail(email, message, "Email Verification");

    res.status(200).json({
      message: "New OTP generated and sent successfully.",
      status: "success",
    });
  } catch (error) {
    req.status(500).json({
      status: "error",
      error: error.message,
    });
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
const startForgetPassword = async (req, res) => {
  try {
    const { email } = req.params;
    const { error } = forgotPasswordValidation(req.params);
    if (error !== undefined) {
      throw new Error(
        error.details[0].message || messages.SOMETHING_WENT_WRONG
      );
    }
    const user = await Users.findOne({ where: { email } });
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found with this email" });
    }
    const { otp, expiresAt } = generateOtp();
    await ResetOtps.upsert({
      email,
      otp,
      expires_at: expiresAt,
    });

    //send OTP via Email
    sendEmail(email, message, "Reset Password");

    return res.status(200).json({
      message: "OTP sent to email",
      expiresAt,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Internal server error" });
  }
};

const completeForgetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const { error } = resetPasswordValidation(req.body);
    if (error) {
      throw new Error(error.details[0].message || message.SOMETHING_WENT_WRONG);
    }
    const user = await Users.findOne({ where: { email } });
    if (!user) {
      throw new Error("User not found");
    }
    const checkIfEmailAndOtpExist = await ResetOtps.findOne({
      where: { email: email, otp: otp },
    });
    if (checkIfEmailAndOtpExist == null) {
      throw new Error("Invalid or Expired OTP");
    }
    const currentTime = new Date();
    const { expires_at } = checkIfEmailAndOtpExist.dataValues;
    if (currentTime > new Date(expires_at)) {
      throw new Error("Invalid or Expired OTP");
    }

    const [hash, salt] = await hashPassword(newPassword);
    await Users.update(
      {
        hash: hash,
        salt: salt,
      },
      { where: { email } }
    );
    await ResetOtps.destroy({ where: { email, otp: otp } });

    //send email
    sendEmail(email, message, "Password Reset Successful");

    res.status(200).json({
      status: "success",
      message: "Password Reset Successfully",
    });
  } catch (error) {
    return res.status(500).json({
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


const createGroup = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    // Validate request body
    const { error } = createGroupValidation(req.body);
    if (error) if (error) throw new Error(error.details[0].message);
    
    const {
      livestock_id,
      totalSlot,
      slotTaken,
      paymentMethod,
      groupName,
      paymentReference,
    } = req.body;
    const { user_id, email } = req.user;

    if (slotTaken > totalSlot) {
      // await t.rollback();
      throw new Error("Slot taken cannot exceed total slots");
    }

    const livestock = await Livestocks.findOne({
      where: { livestock_id, available: true },
      transaction: t,
    });
    if (!livestock) {
      // await t.rollback();
      throw new Error("Livestock not available");
    }

    // Calculate slots and prices
    const totalPrice = parseFloat(livestock.price);
    const slotPrice = Math.ceil(totalPrice / totalSlot);
    if (slotPrice <= 0) {
      // await t.rollback();
      throw new Error("Invalid slot price");
    }
    const finalSlotPrice = slotPrice * slotTaken;
    const totalSlotLeft = totalSlot - slotTaken;
    const totalSlotPrice = slotPrice * totalSlotLeft;

    // Process payment
    const description = `Payment for ${groupName} purchase, ${slotTaken} slots`;
    console.log("Starting transaction with:", {
      amount: finalSlotPrice,
      user_id,
      email,
      paymentMethod,
    });

    const paymentResult = await startTransaction({
      paymentMethod,
      amount: finalSlotPrice,
      user_id,
      email,
      description,
      paymentReference,
    });

    if (paymentResult.paymentLink) {
      await PendingPayments.create({
        user_id,
        email,
        paymentReference: paymentResult.paymentReference,
        actionType: "CREATE_GROUP",
        meta: { livestock_id, totalSlot, slotPrice, slotTaken, groupName },
      });
      await t.rollback();
      return res.status(200).json({
        message: "Payment initialized",
        paymentLink: paymentResult.paymentLink,
        paymentReference: paymentResult.paymentReference,
      });
    }

    const groupId = uuidv4();

    // Create transaction record for successful payment
    if (paymentResult.paymentReference) {
      await Transactions.create(
        {
          transaction_id: uuidv4(),
          email,
          description,
          transaction_type: "debit",
          payment_reference: paymentResult.paymentReference,
          user_id,
          amount: finalSlotPrice,
          status: "success",
          payment_means: paymentMethod,
          group_id: groupId,
          // created_at: new Date().toISOString(),
          // updated_at: new Date().toISOString(),
        },
        { transaction: t }
      );
    }

    const newGroup = await CreateGroups.create(
      {
        group_id: groupId,
        livestock_id,
        totalSlot,
        slotTaken,
        totalSlotLeft,
        totalSlotPrice,
        created_by: user_id,
        paymentMethod,
        paymentReference: paymentResult.paymentReference || null,
        slotPrice,
        groupName,
        status: slotTaken === totalSlot ? "completed" : "active",
        // created_at: new Date().toISOString(),
        // updated_at: new Date().toISOString(),
      },
      { transaction: t }
    );

    await t.commit();
    return res.status(201).json({
      message: "Group created successfully",
      group: newGroup,
    });
  } catch (error) {
    if (!t.finished) {
      await t.rollback();
    }
    return res.status(error.message.includes("Payment") ? 400 : 500).json({
      message: error.message || "Internal server error",
    });
  }
};
// Join Group
const joinGroup = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { error } = joinGroupValidation(req.body);
    if (error) throw new Error(error.details[0].message);

    const { slots, paymentMethod, paymentReference } = req.body;
    const { groupId } = req.params;
    const { user_id, email } = req.user;

    const group = await CreateGroups.findOne({
      where: { group_id: groupId, status: "active" },
      transaction: t,
    });
    if (!group) throw new Error("Group not found or not active");

    const isMember = await joinGroups.findOne({
      where: { group_id: groupId, user_id },
      transaction: t,
    });
    if (isMember) throw new Error("User is already a member of this group");

    if (slots > group.totalSlotLeft)
      return res
        .status(400)
        .json({ message: "Requested slots exceed available slots" });

    const finalSlotPrice = group.slotPrice * slots;
    const description = `Payment for joining group "${group.groupName}" with ${slots} slot(s)`;

    const paymentInit = await startTransaction({
      paymentMethod,
      amount: finalSlotPrice,
      user_id,
      email,
      description,
      paymentReference,
    });

    if (paymentInit.paymentLink) {
      await PendingPayments.create({
        user_id,
        email,
        paymentReference: paymentInit.paymentReference,
        actionType: "JOIN_GROUP",
        meta: {
          groupId,
          slots: Number(slots),
          totalSlot: group.totalSlot,
          slotPrice: group.slotPrice,
          slotTaken: group.slotTaken,
          groupName: group.groupName,
        },
      });
      await t.rollback();
      return res.status(200).json({
        message: "Payment initialized",
        paymentLink: paymentInit.paymentLink,
        paymentReference: paymentInit.paymentReference,
      });
    }

    await completeTransaction({
      paymentReference: paymentInit.paymentReference,
      payment_means: paymentMethod,
      amount: finalSlotPrice,
      email,
      user_id,
      description,
      group_id: groupId,
      transaction: t,
    });

    // Update group info
    const newSlotTaken = group.slotTaken + slots;
    const newTotalSlotLeft = group.totalSlot - newSlotTaken;
    const newTotalSlotPrice = group.totalSlotPrice - finalSlotPrice;
    const newStatus = newTotalSlotLeft === 0 ? "completed" : "active";

    await CreateGroups.update(
      {
        slotTaken: newSlotTaken,
        totalSlotLeft: newTotalSlotLeft,
        totalSlotPrice: newTotalSlotPrice,
        status: newStatus,
        updated_at: new Date(),
      },
      { where: { group_id: groupId }, transaction: t }
    );

    await joinGroups.create(
      {
        group_id: groupId,
        user_id,
        slots,
        status: "approved",
        payment_reference: paymentInit.paymentReference,
        joined_at: new Date(),
      },
      { transaction: t }
    );

    await t.commit();
    return res.status(200).json({
      message: "Successfully joined group",
      groupId,
      slots,
    });
  } catch (err) {
    await t.rollback();
    console.error("Join group error:", err);
    return res.status(500).json({ message: err.message });
  }
};

const completePayment = async (req, res) => {
  let t;
  try {
    const { paymentReference } = req.body;
    const pending = await PendingPayments.findOne({
      where: { paymentReference },
    });
    if (!pending) throw new Error("Pending payment not found");

    const { actionType, meta, user_id, email } = pending;
    // Debug log
    console.log("Pending meta:", meta);
    console.log("Action type:", actionType);

    if (!meta || !meta.slotPrice)
      throw new Error("Missing slotPrice in metadata");

    //Verify Payment
    const verification = await verifyPayment(paymentReference);
    if (verification.data.data.status !== "success")
      throw new Error("Payment not successful yet");
    t = await sequelize.transaction();
    const groupId = meta.groupId || meta.group_id;
    const description =
      actionType === "CREATE_GROUP"
        ? `Payment for ${meta.groupName} creation`
        : `Payment to join group ${meta.groupId}`;
    await Transactions.create(
      {
        transaction_id: uuidv4(),
        email,
        user_id,
        description,
        transaction_type: "debit",
        payment_reference: paymentReference,
        amount: verification.data.data.amount / NAIRA_CONVERSION,
        status: "success",
        payment_means: "others",
        group_id: groupId || null,
      },
      { transaction: t }
    );

    if (actionType === "CREATE_GROUP") {
      const group = await CreateGroups.create(
        {
          group_id: uuidv4(),
          livestock_id: meta.livestock_id,
          totalSlot: meta.totalSlot,
          slotTaken: meta.slotTaken,
          slotPrice: meta.slotPrice,
          totalSlotLeft: meta.totalSlot - meta.slotTaken,
          totalSlotPrice: meta.slotPrice * (meta.totalSlot - meta.slotTaken),
          groupName: meta.groupName,
          created_by: user_id,
          paymentMethod: "others",
          paymentReference,
          status: meta.slotTaken === meta.totalSlot ? "completed" : "active",
        },
        { transaction: t }
      );
    } else if (actionType === "JOIN_GROUP") {
      if (!groupId) {
        throw new Error("Group ID not found in payment metadata");
      }

      console.log("Looking for group with ID:", groupId);
      console.log("Type of groupId:", typeof groupId);

      const group = await CreateGroups.findOne({
        where: { group_id: groupId },
        transaction: t,
      });
      if (!group) throw new Error("Group not found");

      const slotsToJoin = Number(meta.slots || 1); // Default to 1 if missing
      if (!meta.slots) {
        console.warn("Slots field missing in meta, defaulting to 1");
      }
      // Debug logging for calculations
      console.log("Group data:", {
        slotPrice: group.slotPrice,
        slotTaken: group.slotTaken,
        totalSlot: group.totalSlot,
        totalSlotPrice: group.totalSlotPrice,
      });
      console.log("Slots to join:", slotsToJoin);

      // Handle null/undefined values with defaults
      const currentSlotPrice = Number(group.slotPrice) || 0;
      const currentSlotTaken = Number(group.slotTaken) || 0;
      const currentTotalSlot = Number(group.totalSlot) || 0;
      const currentTotalSlotPrice = Number(group.totalSlotPrice) || 0;

      const finalSlotPrice = currentSlotPrice * Number(slotsToJoin);
      const newSlotTaken = currentSlotTaken + Number(slotsToJoin);
      const newTotalSlotLeft = currentTotalSlot - newSlotTaken;
      const newTotalSlotPrice = currentTotalSlotPrice - finalSlotPrice;
      const newStatus = newTotalSlotLeft === 0 ? "completed" : "active";

      console.log("Calculated values:", {
        finalSlotPrice,
        newSlotTaken,
        newTotalSlotLeft,
        newTotalSlotPrice,
        newStatus,
      });

      if (
        isNaN(newSlotTaken) ||
        isNaN(newTotalSlotLeft) ||
        isNaN(newTotalSlotPrice)
      ) {
        throw new Error(
          "Invalid calculation results - one or more values are NaN"
        );
      }

      // const finalSlotPrice = group.slotPrice * meta.slots;
      // const newSlotTaken = group.slotTaken + meta.slots;
      // const newTotalSlotLeft = group.totalSlot - newSlotTaken;
      // const newTotalSlotPrice = group.totalSlotPrice - finalSlotPrice;
      // const newStatus = newTotalSlotLeft === 0 ? "completed" : "active";

      await joinGroups.create(
        {
          group_id: groupId,
          user_id,
          slots: slotsToJoin,
          payment_reference: paymentReference,
          status: "approved",
          joined_at: new Date(),
        },
        { transaction: t }
      );

      await CreateGroups.update(
        {
          slotTaken: newSlotTaken,
          totalSlotLeft: newTotalSlotLeft,
          totalSlotPrice: newTotalSlotPrice,
          status: newStatus,
          updated_at: new Date(),
        },
        { where: { group_id: groupId }, transaction: t }
      );
    }

    await PendingPayments.destroy({ where: { paymentReference } });
    await t.commit();

    // sendEmail(email, message, "Payment Completed");

    return res.status(200).json({
      message: `${actionType} completed successfully`,
      groupId: groupId,
    });
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    console.error("Complete payment error:", err);
    return res.status(500).json({ message: err.message });
  }
};

const startWalletFunding = async (req, res) => {
  try {
    const { email, user_id } = req.user; // passed from the auth
    const { amount } = req.body;
    if (amount < 1000) throw new Error("Amount must be greater than 1000");
    const response = await initializePayment(email, amount);

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
        Number(getWallet.balance) +
        response.data.data.amount / NAIRA_CONVERSION;
      console.log(
        "Updating wallet balance to:",
        updateAmount,
        "for user_id:",
        user_id
      );
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
  startForgetPassword,
  completeForgetPassword,
  createLivestock,
  getAvailableLivestocks,
  createGroup,
  joinGroup,
  startWalletFunding,
  completWalletFunding,
  completePayment,
  resendOtp,
};


      // const getSingleLivestock = async (req, res) => {
      //   try {
      //     const { livestock_id } = req.params;
      //     const { user_id } = req.user;
      //     if (sn == null) throw new Error("Livestock not found");
      //     const livestock = await Livestocks.findByPk({
      //       where: { livestock_id: livestock_id, user_id: user_id, available: true },
      //     });
      //     if (livestock == null) throw new Error("Livestock not found");
      //     res.status(200).json({
      //       status: "success",
      //       data: livestock,
      //     });
      //   } catch (error) {
      //     res.status(400).json({
      //       status: "error",
      //       message: error.message,
      //     });
      //   }
      // };

      
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
      
      // const createGroup = async (req, res) => {
      //   const t = await sequelize.transaction();
      //   try {
      //     // Validate request body
      //     const { error, value } = createGroupValidation(req.body);
      //     if (error) {
      //       // await t.rollback();
      //       return res.status(400).json({ message: error.details[0].message });
      //     }
      
      //     const {
      //       livestock_id,
      //       totalSlot,
      //       slotTaken,
      //       paymentMethod,
      //       groupName,
      //       paymentReference,
      //     } = req.body;
      //     const { user_id, email } = req.user; // Assuming email is available in req.user
      //     console.log("Request data:", {
      //       livestock_id,
      //       totalSlot,
      //       slotTaken,
      //       paymentMethod,
      //       groupName,
      //       paymentReference,
      //       user_id,
      //       email,
      //     });
      
      //     // Validate slot count
      //     if (slotTaken > totalSlot) {
      //       await t.rollback();
      //       return res
      //         .status(400)
      //         .json({ message: "Slot taken cannot be greater than total slot" });
      //     }
      
      //     // Check if livestock is available
      //     const livestock = await Livestocks.findOne({
      //       where: { livestock_id, available: true },
      //       transaction: t,
      //     });
      //     console.log("livestock:", livestock);
      //     if (!livestock) {
      //       await t.rollback();
      //       return res.status(404).json({ message: "Livestock not available" });
      //     }
      
      //     // Calculate totalSlotLeft (initially equals totalSlot, then reduces by slotTaken)
      //     const totalSlotLeft = totalSlot - slotTaken;
      //     console.log("totalSlotLeft:", totalSlotLeft);
      
      //     // Calculate slot price and total slot price
      //     const totalPrice = parseFloat(livestock.price);
      //     //console.log("totalPrice:", totalPrice);
      //     const slotPrice = Math.ceil(totalPrice / totalSlot);
      //     //console.log("slotPrice:", slotPrice);
      //     const finalSlotPrice = slotPrice * slotTaken;
      //     //console.log("finalSlotPrice:  ", finalSlotPrice);
      
      //     // Calculate totalSlotPrice (price for remaining slots)
      //     const totalSlotPrice = slotPrice * totalSlotLeft;
      //     console.log("totalSlotPrice (for remaining slots):", totalSlotPrice);
      
      //     if (slotPrice <= 0) {
      //       return res.status(400).json({ message: "Invalid slot price" });
      //     }
      
      //     let finalPaymentReference = null;
      
      //     // Handle payment method
      //     if (paymentMethod === paymentMeans.WALLET) {
      //       // Debit wallet
      //       const transactionRef = await debitWallet(
      //         finalSlotPrice,
      //         user_id,
      //         email,
      //         `Wallet Debit for ${groupName} purchase, ${slotTaken} slots`
      //       );
      //       //console.log("Wallet debit transactionRef:", transactionRef);
      //       if (!transactionRef) {
      //         await t.rollback();
      //         return res.status(400).json({ message: "Insufficient balance" });
      //       }
      //       finalPaymentReference = transactionRef;
      
      //       // Save wallet transaction
      //       const transactionData = {
      //         transaction_id: uuidv4(),
      //         email,
      //         description: `Wallet Debit for ${groupName} purchase, ${slotTaken} slots`,
      //         transaction_type: "debit",
      //         payment_reference: finalPaymentReference,
      //         user_id,
      //         amount: finalSlotPrice,
      //         status: "success",
      //         payment_means: paymentMethod,
      //       };
      //       //console.log("Creating wallet transaction with data:", transactionData);
      //       await Transactions.create(transactionData, { transaction: t });
      //       console.log("Wallet transaction saved successfully");
      //     } else if (paymentMethod === paymentMeans.OTHERS) {
      //       if (!paymentReference) {
      //         // Initialize new payment
      //         const paymentResponse = await initializePayment(email, finalSlotPrice);
      //         const { authorization_url, reference } = paymentResponse.data.data;
      //         await t.rollback();
      
      //         return res.status(200).json({
      //           message: "Payment initialization successful",
      //           paymentLink: authorization_url,
      //           paymentReference: reference,
      //         });
      //       }
      
      //       // Verify existing payment reference
      //       const existingTransaction = await checkTransactionStatus(
      //         paymentReference
      //       );
      //       if (existingTransaction) {
      //         return res
      //           .status(400)
      //           .json({ message: "Payment reference already used" });
      //       }
      
      //       const verification = await verifyPayment(paymentReference);
      //       if (verification.data.data.status !== "success") {
      //         return res.status(400).json({ message: "Payment failed" });
      //       }
      
      //       // Validate payment amount
      //       // const paidAmount = verification.data.data.amount / 100; // Convert from kobo
      //       // if (paidAmount !== finalSlotPrice) {
      //       //   return res
      //       //     .status(400)
      //       //     .json({ message: "Paid amount does not match expected amount" });
      //       // }
      
      //       finalPaymentReference = paymentReference;
      
      //       // Save other transaction
      //       const transactionData = {
      //         transaction_id: uuidv4(),
      //         email,
      //         description: `Wallet Debit for ${groupName} purchase, ${slotTaken} slots`,
      //         transaction_type: "debit",
      //         reference: finalPaymentReference,
      //         user_id,
      //         amount: finalSlotPrice,
      //         status: "success",
      //         payment_means: paymentMethod,
      //       };
      //       console.log("Creating other transaction with data:", transactionData);
      //       await Transactions.create(transactionData, { transaction: t });
      //       console.log("Other transaction saved successfully");
      //     } else {
      //       return res.status(400).json({ message: "Invalid payment method" });
      //     }
      
      //     // Generate unique group_id
      //     const groupId = uuidv4();
      
      //     // Create the group
      //     const newGroup = await CreateGroups.create(
      //       {
      //         group_id: groupId,
      //         livestock_id,
      //         totalSlot,
      //         slotTaken,
      //         totalSlotLeft,
      //         totalSlotPrice,
      //         created_by: user_id,
      //         paymentMethod,
      //         paymentReference: finalPaymentReference,
      //         slotPrice,
      //         groupName,
      //         status: slotTaken === totalSlot ? "completed" : "active",
      //         created_at: new Date().toISOString(),
      //         updated_at: new Date().toISOString(),
      //       },
      //       { transaction: t }
      //     );
      //     console.log("New group created:", newGroup);
      
      //     // Update transaction with g  roup_id (optional, for tracking)
      //     await Transactions.update(
      //       {
      //         group_id: groupId, // Add group_id to link transaction with group
      //         updated_at: new Date().toISOString(),
      //       },
      //       {
      //         where: { payment_reference: finalPaymentReference },
      //         transaction: t,
      //       }
      //     );
      //     await t.commit();
      //     return res.status(201).json({
      //       message: "Group created successfully",
      //       group: newGroup,
      //     });
      //   } catch (error) {
      //     console.error("Error in createGroup:", error);
      //     return res.status(500).json({
      //       message: error.message || "Internal server error",
      //     });
      //   }





      // const joinGroup = async (req, res) => {
      //   const t = await sequelize.transaction();
      //   try {
      //     // Validate request body
      //     const { error, value } = joinGroupValidation(req.body);
      //     if (error) {
      //       await t.rollback();
      //       return res.status(400).json({ message: error.details[0].message });
      //     }
      
      //     const { slots, paymentMethod, paymentReference } = req.body;
      //     const { groupId } = req.params;
      //     const { user_id, email } = req.user;
      //     console.log("Request data:", {
      //       groupId,
      //       slots,
      //       paymentMethod,
      //       paymentReference,
      //       user_id,
      //       email,
      //     });
      
      //     // Check if group exists and is active
      //     const group = await CreateGroups.findOne({
      //       where: { group_id: groupId, status: "active" },
      //       // include: [
      //       //   { model: Livestocks, as: "livestock", where: { available: true } },
      //       // ],
      //       transaction: t,
      //     });
      //     if (!group) throw new Error("Group not found or not active");
      //     const existingMember = await joinGroups.findOne({
      //       where: { group_id: groupId, user_id },
      //       transaction: t,
      //     });
      //     if (existingMember)
      //       throw new Error("User is already a member of this group");
      //     // Validate available slots
      //     if (slots > group.totalSlotLeft)
      //       throw new Error("Requested slots exceed available slots");
      
      //     // Calculate payment amount
      //     const finalSlotPrice = group.slotPrice * slots;
      //     console.log("finalSlotPrice:", finalSlotPrice);
      
      //     let finalPaymentReference = null;
      
      //     // Handle payment method
      //     if (paymentMethod === paymentMeans.WALLET) {
      //       // Debit wallet
      //       const transactionRef = await debitWallet(
      //         finalSlotPrice,
      //         user_id,
      //         email,
      //         `Wallet Debit for joining ${group.groupName}, ${slots} slots`
      //       );
      //       console.log("Wallet debit transactionRef:", transactionRef);
      //       if (!transactionRef) {
      //         await t.rollback();
      //         return res.status(400).json({ message: "Insufficient balance" });
      //       }
      //       finalPaymentReference = transactionRef;
      
      //       // Save wallet transaction
      //       const transactionData = {
      //         transaction_id: uuidv4(),
      //         email,
      //         description: `Wallet Debit for joining ${group.groupName}, ${slots} slots`,
      //         transaction_type: "debit",
      //         payment_reference: finalPaymentReference,
      //         user_id,
      //         amount: finalSlotPrice,
      //         status: "success",
      //         payment_means: paymentMethod,
      //         group_id: groupId,
      //         created_at: new Date().toISOString(),
      //         updated_at: new Date().toISOString(),
      //       };
      //       console.log("Creating wallet transaction with data:", transactionData);
      //       await Transactions.create(transactionData, { transaction: t });
      //       console.log("Wallet transaction saved successfully");
      //     } else if (paymentMethod === paymentMeans.OTHERS) {
      //       if (!paymentReference) {
      //         // Initialize new payment
      //         const paymentResponse = await initializePayment(email, finalSlotPrice);
      //         const { authorization_url, reference } = paymentResponse.data.data;
      //         await t.rollback();
      //         return res.status(200).json({
      //           message: "Payment initialization successful",
      //           paymentLink: authorization_url,
      //           paymentReference: reference,
      //         });
      //       }
      
      //       // Verify existing payment reference
      //       const existingTransaction = await checkTransactionStatus(
      //         paymentReference
      //       );
      //       if (existingTransaction) {
      //         await t.rollback();
      //         return res
      //           .status(400)
      //           .json({ message: "Payment reference already used" });
      //       }
      
      //       const verification = await verifyPayment(paymentReference);
      //       if (verification.data.data.status !== "success") {
      //         await t.rollback();
      //         return res.status(400).json({ message: "Payment failed" });
      //       }
      
      //       finalPaymentReference = paymentReference;
      
      //       // Save other transaction
      //       const transactionData = {
      //         transaction_id: uuidv4(),
      //         email,
      //         description: `Payment for joining ${group.groupName}, ${slots} slots`,
      //         transaction_type: "debit",
      //         payment_reference: finalPaymentReference,
      //         user_id,
      //         amount: finalSlotPrice,
      //         status: "success",
      //         payment_means: paymentMethod,
      //         group_id: groupId,
      //         created_at: new Date().toISOString(),
      //         updated_at: new Date().toISOString(),
      //       };
      //       console.log("Creating other transaction with data:", transactionData);
      //       await Transactions.create(transactionData, { transaction: t });
      //       console.log("Other transaction saved successfully");
      //     } else {
      //       await t.rollback();
      //       return res.status(400).json({ message: "Invalid payment method" });
      //     }
      
      //     // Update group slots
      //     const newSlotTaken = group.slotTaken + slots;
      //     const newTotalSlotLeft = group.totalSlot - newSlotTaken;
      //     const amountPaid =group.slotPrice * slots
      //     const newTotalSlotPrice = group.totalSlotPrice - amountPaid
      //     const newStatus = newTotalSlotLeft === 0 ? "completed" : "active";
      
      //     await CreateGroups.update(
      //       {
      //         slotTaken: newSlotTaken,
      //         totalSlotLeft: newTotalSlotLeft,
      //         totalSlotPrice: newTotalSlotPrice,
      //         status: newStatus,
      //         updated_at: new Date().toISOString(),
      //       },
      //       { where: { group_id: groupId }, transaction: t }
      //     );
      
      //     // Add user to group
      //     await joinGroups.create(
      //       {
      //         group_id: groupId,
      //         user_id,
      //         slots,
      //         status: "approved",
      //         payment_reference: finalPaymentReference,
      //         joined_at: new Date().toISOString(),
      //       },
      //       { transaction: t }
      //     );
      
      //     await t.commit();
      //     return res.status(200).json({
      //       message: "Successfully joined group",
      //       groupId,
      //       slots,
      //     });
      //   } catch (error) {
      //     await t.rollback();
      //     console.error("Error in joinGroup:", error);
      //     return res.status(500).json({
      //       message: error.message || "Internal server error",
      //     });
      //   }
      // };
      // };
