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
const { UserTemp } = require("../models/userTemp");
const { Otp } = require("../models/otpModel");
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
const { ResetOtp } = require("../models/resetOtpModel");
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
    await UserTemp.create({
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
    await Otp.create({
      email: email,
      otp: otp,
      expires_at: expiresAt,
    });

    // sendEmail(email, message, "Verify Your Account");

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
  const t = await sequelize.transaction() // Start transaction explicitly
  try {
    const { email, otp } = req.params

    const checkIfEmailAndOtpExist = await Otp.findOne({
      where: { email: email, otp: otp },
    })
    if (checkIfEmailAndOtpExist == null) throw new Error("Invalid or Expired otp")

    const userTemps = await UserTemp.findOne({ where: { email: email } })
    if (userTemps == null) throw new Error("User record not found")

    const newUser = await Users.create(
      {
        user_id: userTemps.user_id,
        surname: userTemps.surname,
        othernames: userTemps.othernames,
        email: userTemps.email,
        hash: userTemps.hash,
        salt: userTemps.salt,
        phoneNumber: userTemps.phoneNumber,
        location: userTemps.location,
        address: userTemps.address,
        is_email_verified: true,
        role: "user",
      },
      { transaction: t },
    )

    await Wallets.create(
      {
        wallet_id: uuidv4(),
        user_id: newUser.user_id, // Use newUser.user_id here
        balance: 0,
      },
      { transaction: t },
    )

    await Otp.destroy({ where: { email: email }, transaction: t })
    await UserTemp.destroy({ where: { email: email }, transaction: t }) // Also destroy userTemp within transaction

    const token = jwt.sign({ _id: newUser.user_id, email: newUser.email, role: newUser.role }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    })

    await t.commit() // Commit transaction

    res.status(200).json({
      status: "success",
      message: "Email Verified and User created successfully",
      token: token, // Return token in response body
    })
  } catch (error) {
    await t.rollback() // Rollback on error
    console.error("Error in verifyEmail:", error) // More detailed error logging
    res.status(400).json({ error: error.message })
  }
}

const resendOtp = async (req, res) => {
  try {
    const { email } = req.params;
    const { error: validationError } = resendOtpValidation(req.params);
    if (validationError) throw new Error(validationError.details[0].message);

    let otpRecord = await Otp.findOne({ where: { email } });

    if (otpRecord == null) {
      throw new Error(
        "No active OTP found for this email. Please ensure you have signed up"
      );
    }

    const currentTime = new Date();
    const expiresAtDate = new Date(otpRecord.dataValues.expires_at);
    if (currentTime < expiresAtDate) {
      throw new Error(
        "Current OTP is still valid. Please wait before requesting a new one"
      );
    }

    const { otp: newOtpValue, expiresAt: newExpiresAt } = generateOtp();

    await Otp.update(
      { otp: newOtpValue, expires_at: newExpiresAt },
      { where: { email } }
    );

    res.status(200).json({
      message: "New OTP generated and sent successfully.",
      status: "success",
    });
  } catch (error) {
    console.error("Error in resendOtp:", error);
    res.status(400).json({
      status: "error",
      error: error.message,
    });
  }
};
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Backend: Login attempt for email:", email)
    if (!email.trim() || !password.trim())
      throw new Error("Email and password are required");
    const user = await Users.findOne({ where: { email: email } });
    if (user == null) throw new Error("Invalid email or password");
    if (!user.is_email_verified) {
      throw new Error("Email not verified. Please verify your email to log in.")
    }
    const credentialsMatch = await bcrypt.compare(password, user.hash);
    if (!credentialsMatch) throw new Error("Invalid email or password");
    const token = jwt.sign(
      { _id: user.user_id, email: user.email, role: user.role }, // Use user.user_id
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    )
    res.setHeader("access_token", token);
    console.log("Backend: Login successful, token generated for:", email)

    res.status(200).json({
      status: "success",
      message: "User logged in successfully",
      token: token,
    });
  } catch (error) {
    console.error("Backend: Login error:", error.message)
    res.status(400).json({
      status: "error",
      error: error.message || "An unexpected error during login"
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
    // req.user is populated by the authorization middleware
    const { email } = req.user;

    console.log(
      "getUser Controller: Attempting to fetch user for email:",
      email
    );

    const user = await Users.findOne({
      where: { email: email },
      attributes: { exclude: ["password", "salt", "hash"] }, // Exclude sensitive fields
    });

    if (!user) {
      console.warn("getUser Controller: User not found for email:", email);
      return res.status(404).json({
        status: "error",
        message: "User not found.",
      });
    }

    console.log("getUser Controller: User fetched successfully:", user.email);
    // Ensure you are sending a JSON response and returning
    return res.status(200).json({
      status: "success",
      message: "User data retrieved successfully",
      data: user, // Send the user data
    });
  } catch (error) {
    console.error("getUser Controller: Error fetching user:", error.message);
    // Ensure errors are caught and a JSON response is sent
    return res.status(400).json({
      status: "error",
      message: error.message || "Failed to retrieve user data.",
    });
  }
};
const startForgotPassword = async (req, res) => {
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
    await ResetOtp.upsert({
      email,
      otp,
      expires_at: expiresAt,
    });

    //send OTP via Email
    // sendEmail(email, message, "Reset Password");

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

const completeForgotPassword = async (req, res) => {
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
    const checkIfEmailAndOtpExist = await ResetOtp.findOne({
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
    await ResetOtp.destroy({ where: { email, otp: otp } });

    //send email
    // sendEmail(email, message, "Password Reset Successful");

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
      // attributes: ["livestock_id", "name", "price", "weight", "description"],
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

// NEW: getActiveGroups controller
const getActiveGroups = async (req, res) => {
  try {
    const activeGroups = await CreateGroups.findAll({
      where: { status: "active" },
      include: [
        {
          model: Livestocks,
          as: "livestock", // Ensure this alias matches your model association
          attributes: [
            "livestock_id",
            "name",
            "price",
            "minimum_amount",
            "imageUrl",
          ],
        },
      ],
      order:[["created_at", "DESC"]]
    });

    // Calculate progress for each group
    const formattedGroups = activeGroups.map((group) => {
      const progress = (group.slotTaken / group.totalSlot) * 100;
      return {
        ...group.toJSON(), // Convert Sequelize instance to plain object
        progress: progress,
      };
    });

    res.status(200).json({
      status: "success",
      message: "Active groups retrieved successfully",
      data: formattedGroups,
    });
  } catch (error) {
    console.error("Error in getActiveGroups:", error.message, error.stack); // More detailed error logging
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// NEW: getMyGroups controller
const getMyGroups = async (req, res) => {
  try {
    const { user_id } = req.user;
    console.log(
      "Backend: getMyGroups - Fetching participations for user_id:",
      user_id
    ); // NEW LOG
    const userParticipations = await joinGroups.findAll({
      where: { user_id: user_id },
      include: [
        {
          model: CreateGroups,
          as: "group", // Ensure this alias matches your model association
          attributes: [
            "group_id",
            "groupName",
            "description",
            "totalSlot",
            "slotTaken",
            "slotPrice",
            "finalSlotPriceTaken",
            "totalSlotLeft",
            "totalSlotPriceLeft",
            "status",
            // "creatorInitialSlots",
          ],
          include: [
            {
              model: Livestocks,
              as: "livestock", // Ensure this alias matches your model association
              attributes: [
                "livestock_id",
                "name",
                "price",
                "minimum_amount",
                "imageUrl",
              ],
            },
          ],
        },
        {
          model: Users,
          as: "user", // Include user details for the participant
          attributes: ["user_id", "surname", "othernames", "email"],
        },
      ],
    });
    console.log(
      "Backend: getMyGroups - Raw userParticipations found:",
      userParticipations.map((p) => p.toJSON())
    ); // NEW LOG

    // Format data and calculate progress
    const formattedParticipations = userParticipations
      .map((participation) => {
        const group = participation.group;
        if (!group) {
          console.warn(
            "Backend: getMyGroups - Participation found without associated group:",
            participation.toJSON()
          ); // NEW LOG
          return null; // Should not happen if include is correct
        }

        const progress = (group.slotTaken / group.totalSlot) * 100;
        return {
          ...participation.toJSON(), // Convert Sequelize instance to plain object
          group: {
            ...group.toJSON(),
            progress: progress, // Add calculated progress to the group object
          },
        };
      })
      .filter(Boolean); // Remove any null entries if group was not found
    console.log(
      "Backend: getMyGroups - Formatted participations to send:",
      formattedParticipations
    ); // NEW LOG

    res.status(200).json({
      status: "success",
      message: "User groups retrieved successfully",
      data: formattedParticipations,
    });
  } catch (error) {
    console.error("Error in getMyGroups:", error.message, error.stack); // More detailed error logging
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

const getGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params
    const group = await CreateGroups.findOne({
      where: { group_id: groupId },
      attributes: {
        include: [
          ["slotTaken", "creatorInitialSlot"] // alias slotTaken for frontend
        ]
      },
      include: [
        {
          model: Livestocks,
          as: "livestock",
          attributes: ["livestock_id", "name", "price", "minimum_amount", "imageUrl", "description"],
        },
        {
          model: Users,
          as: "creator",
          attributes: ["user_id", "surname", "othernames", "email"],
        },
        {
          model: joinGroups,
          as: "participations",
          include: [
            {
              model: Users,
              as: "user",
              attributes: ["user_id", "surname", "othernames", "email"],
            },
          ],
        },
      ],
    })

    if (!group) {
      return res.status(404).json({
        status: "error",
        message: "Group not found.",
      })
    }

    res.status(200).json({
      status: "success",
      message: "Group details retrieved successfully",
      data: group,
    })
  } catch (error) {
    console.error("Error in getGroupDetails:", error)
    res.status(400).json({
      status: "error",
      message: error.message,
    })
  }
}

const startCreateGroup = async (req, res) => {
  try {
    console.log("=== START CREATE GROUP DEBUG ===");
    console.log("Request headers:", req.headers);
    console.log("Request body:", req.body);
    console.log("Request body type:", typeof req.body);
    console.log("User from middleware:", req.user);
    console.log("===========================");

    if (!req.body || typeof req.body !== 'object') {
      throw new Error("Invalid request body format");
    }

    // Validate the request body
    const { error } = createGroupValidation(req.body);
    if (error) {
      console.log("Validation error:", error.details[0].message);
      throw new Error(error.details[0].message);
    }

    console.log("Validation passed successfully");

    const {
      livestock_id,
      totalSlot,
      slotPrice,
      description,
      groupName,
      slotTaken,
    } = req.body;

    // Validate required fields
    if (!livestock_id) throw new Error("livestock_id is required");
    if (!totalSlot) throw new Error("totalSlot is required");
    if (!slotPrice) throw new Error("slotPrice is required");
    if (!groupName) throw new Error("groupName is required");
    if (!slotTaken) throw new Error("slotTaken is required");

    console.log("Extracted fields:", {
      livestock_id,
      totalSlot,
      slotPrice,
      groupName,
      slotTaken
    });

    const { user_id, email } = req.user;
    console.log("User info:", { user_id, email });

    // Find the livestock
    const livestock = await Livestocks.findOne({ where: { livestock_id } });
    if (!livestock) throw new Error("Livestock not found");

    console.log("Found livestock:", livestock.toJSON());

    // Validate creatorInitialSlots
    if (slotTaken <= 0 || slotTaken > totalSlot) {
      throw new Error("Invalid number of initial slots for creator");
    }

    // Validate numeric fields
    if (!Number.isInteger(Number(totalSlot)) || totalSlot <= 0) {
      throw new Error("Total slots must be a positive integer");
    }
    if (!Number.isFinite(Number(slotPrice)) || slotPrice <= 0) {
      throw new Error("Slot price must be a positive number");
    }

    const livestockForeignKey = livestock.livestock_id || livestock.id;
    console.log("Using livestock foreign key:", livestockForeignKey);

    const newGroup = await CreateGroups.create({
      group_id: uuidv4(),
      livestock_id: livestockForeignKey,
      created_by: user_id,
      totalSlot: Number(totalSlot),
      slotPrice: Number(slotPrice),
      totalSlotLeft: Number(totalSlot) - Number(slotTaken),
      totalSlotPriceLeft: Number(totalSlot) * Number(slotPrice),
      description: description || '',
      groupName,
      status: "pending",
      slotTaken: slotTaken,
      finalSlotPriceTaken: slotPrice * slotTaken,
      paymentReference: null,
      paymentMethod: "wallet",
      // creatorInitialSlots: Number(creatorInitialSlots),
    });

    console.log("Created group successfully:", newGroup.toJSON());

    res.status(200).json({
      status: "success",
      message: "Group draft created successfully. Proceed to finalize payment.",
      data: {
        group_id: newGroup.group_id,
      },
    });
  } catch (error) {
    console.error("=== CREATE GROUP ERROR ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("========================");
    
    res.status(400).json({
      status: "error",
      message: error.message || "Server error creating group draft",
    });
  }
};

const completeCreateGroup = async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const { groupId, paymentMethod, paymentReference } = req.body
    const { user_id, email } = req.user

    if (!groupId || !paymentMethod) {
      throw new Error("Group ID and payment method are required.")
    }

    const group = await CreateGroups.findOne({
      where: { group_id: groupId, created_by: user_id },
      transaction: t,
    })

    if (!group) {
      throw new Error("Group not found or you are not the creator.")
    }
    if (group.status !== "pending") {
      throw new Error("Group is already active or completed.")
    }
    const creatorPaymentAmount = group.slotPrice * group.creatorInitialSlots
    console.log("creatorPaymentAmount:", creatorPaymentAmount, typeof creatorPaymentAmount);

    let finalPaymentRef = paymentReference

    if (paymentMethod === paymentMeans.WALLET) {
      // Debit wallet
      const debitSuccess = await debitWallet(
        creatorPaymentAmount,
        user_id,
        email,
        `Initial contribution for group "${group.groupName}"`,
        t, // Pass transaction object
      )
      if (!debitSuccess) {
        throw new Error("Wallet debit failed or insufficient balance.")
      }
      finalPaymentRef = `wallet_create_${group.group_id}_${uuidv4()}` // Generate a reference for wallet payment
    } else if (paymentMethod === paymentMeans.OTHERS) {
      if (!paymentReference) {
        // This means the payment needs to be initiated
        const frontendBaseUrl = process.env.FRONTEND_BASE_URL || "http://localhost:3000"
        const callbackUrl = `${frontendBaseUrl}/dashboard/groups/create/complete?group_id=${group.group_id}&payment_method=others`
        const paystackResponse = await initializePayment(email, creatorPaymentAmount, callbackUrl)

        if (!paystackResponse?.data?.data?.authorization_url) {
          throw new Error("Failed to get payment authorization URL from Paystack.")
        }

        finalPaymentRef = paystackResponse.data.data.reference

        // Create a pending payment record for external payment
        await PendingPayments.create(
          {
            user_id,
            email,
            paymentReference: finalPaymentRef,
            actionType: "CREATE_GROUP",
            status: "pending",
            metadata: {
              groupId: group.group_id,
              slots: group.creatorInitialSlots,
              amount: creatorPaymentAmount,
              paymentMethod: paymentMeans.OTHERS,
              groupName: group.groupName,
            },
          },
          { transaction: t },
        )

        await t.commit() // Commit the pending payment record
        return res.status(200).json({
          status: "success",
          message: "Redirecting to payment gateway.",
          createDetails: {
            paymentLink: paystackResponse.data.data.authorization_url,
            paymentReference: finalPaymentRef,
          },
        })
      } else {
        // This means it's a callback from an external payment gateway
        const existingTransaction = await Transactions.findOne({
          where: { payment_reference: paymentReference },
          transaction: t,
        })
        if (existingTransaction) {
          throw new Error("Payment reference already used.")
        }

        const verification = await verifyPayment(paymentReference)
        if (verification.data.data.status !== "success") {
          throw new Error("Payment verification failed.")
        }
        const verifiedAmount = verification.data.data.amount / NAIRA_CONVERSION

        if (verifiedAmount !== creatorPaymentAmount) {
          throw new Error("Payment amount mismatch.")
        }

        await Transactions.create(
          {
            transaction_id: uuidv4(),
            email,
            description: `Initial contribution for group "${group.groupName}" via Card/Bank Transfer`,
            transaction_type: "debit",
            payment_reference: paymentReference,
            user_id,
            amount: creatorPaymentAmount,
            status: "success",
            payment_means: paymentMethod,
            group_id: group.group_id,
          },
          { transaction: t },
        )

        // Delete the pending payment record after successful verification
        await PendingPayments.destroy({
          where: { paymentReference: paymentReference, actionType: "CREATE_GROUP" },
          transaction: t,
        })
      }
    } else {
      throw new Error("Invalid payment method.")
    }

    // Update group status and slots
    group.status = "active"
    group.slotTaken = group.slotTaken
    group.totalSlotLeft = group.totalSlot - group.slotTaken
    group.finalSlotPriceTaken = creatorPaymentAmount
    group.totalSlotPriceLeft = group.totalSlot * group.slotPrice - creatorPaymentAmount
    group.paymentReference = finalPaymentRef
    group.paymentMethod = paymentMethod
    await group.save({ transaction: t })

    // Record creator's participation
    await joinGroups.create(
      {
        join_id: uuidv4(),
        group_id: group.group_id,
        user_id: user_id,
        slots: group.slotTaken,
        status: "approved",
        payment_reference: finalPaymentRef,
        joined_at: new Date(),
      },
      { transaction: t },
    )

    await t.commit()

    return res.status(200).json({
      status: "success",
      message: "Group activated and funded successfully!",
      group_id: group.group_id,
    })
  } catch (error) {
    await t.rollback()
    console.error("Error in completeCreateGroup:", error)
    res.status(400).json({
      status: "error",
      message: error.message || "Failed to complete group creation.",
    })
  }
}

const startJoinGroup = async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const { error } = joinGroupValidation(req.body)
    if (error) {
      throw new Error(error.details[0].message)
    }
    const { slots, paymentMethod } = req.body
    const { groupId } = req.params
    const { user_id, email } = req.user

    if (!slots || slots <= 0) {
      throw new Error("Number of slots must be positive.")
    }

    const group = await CreateGroups.findOne({
      where: { group_id: groupId, status: "active" },
      transaction: t,
    })
    if (!group) {
      throw new Error("Group not found or not active.")
    }

    const isMember = await joinGroups.findOne({
      where: { group_id: groupId, user_id },
      transaction: t,
    })
    if (isMember) {
      throw new Error("You have already joined this group.")
    }

    if (slots > group.totalSlotLeft) {
      throw new Error(`Requested slots (${slots}) exceed available slots (${group.totalSlotLeft}).`)
    }

    const finalSlotPrice = group.slotPrice * slots

    let paymentLink = null
    let paymentReference = null

    if (paymentMethod === paymentMeans.WALLET) {
      paymentReference = `pending_wallet_join_${groupId}_${uuidv4()}`
    } else if (paymentMethod === paymentMeans.OTHERS) {
      const frontendBaseUrl = process.env.FRONTEND_BASE_URL || "http://localhost:3000"
      const callbackUrl = `${frontendBaseUrl}/dashboard/groups/join/complete?group_id=${groupId}&payment_method=others`
      const init = await initializePayment(email, finalSlotPrice, callbackUrl)

      if (!init?.data?.data?.authorization_url) {
        throw new Error("Failed to get payment authorization URL from Paystack.")
      }
      paymentLink = init.data.data.authorization_url
      paymentReference = init.data.data.reference
    } else {
      throw new Error("Invalid payment method.")
    }

    await PendingPayments.create(
      {
        user_id,
        email,
        paymentReference,
        actionType: "JOIN_GROUP",
        status: "pending",
        metadata: {
          groupId,
          slots,
          slotPrice: group.slotPrice,
          groupName: group.groupName,
          amount: finalSlotPrice,
          paymentMethod,
        },
      },
      { transaction: t },
    )

    await t.commit()

    return res.status(200).json({
      status: "success",
      message: "Join request initiated",
      joinDetails: {
        paymentMethod,
        paymentLink,
        paymentReference,
      },
    })
  } catch (error) {
    await t.rollback()
    console.error("Error in startJoinGroup:", error)
    return res.status(400).json({
      status: "error",
      message: error.message || "Failed to initiate join group request.",
    })
  }
}

const completeJoinGroup = async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const { paymentReference } = req.params // Assuming reference is in params for callback
    const { user_id, email } = req.user

    const pending = await PendingPayments.findOne({
      where: {
        user_id,
        paymentReference: paymentReference || null,
        actionType: "JOIN_GROUP",
        status: "pending",
      },
      transaction: t,
    })

    if (!pending) {
      throw new Error("No pending join request found for this reference.")
    }

    const { groupId, slots, slotPrice, groupName, amount: expectedAmount, paymentMethod } = pending.meta

    const finalPaymentAmount = slots * slotPrice

    if (paymentMethod === paymentMeans.WALLET) {
      const debitSuccess = await debitWallet(
        finalPaymentAmount,
        user_id,
        email,
        `Joining group "${groupName}"`,
        t, // Pass transaction object
      )
      if (!debitSuccess) {
        throw new Error("Wallet debit failed or insufficient balance.")
      }
    } else if (paymentMethod === paymentMeans.OTHERS) {
      const existing = await Transactions.findOne({
        where: { payment_reference: paymentReference },
        transaction: t,
      })
      if (existing) {
        throw new Error("Payment reference already used.")
      }

      const verification = await verifyPayment(paymentReference)
      if (verification.data.data.status !== "success") {
        throw new Error("Payment verification failed.")
      }
      const verifiedAmount = verification.data.data.amount / NAIRA_CONVERSION

      if (verifiedAmount !== expectedAmount) {
        throw new Error("Payment amount mismatch.")
      }

      await Transactions.create(
        {
          transaction_id: uuidv4(),
          email,
          description: `Joining group "${groupName}" via Card/Bank Transfer`,
          transaction_type: "debit",
          payment_reference: paymentReference,
          user_id,
          amount: finalPaymentAmount,
          status: "success",
          payment_means: paymentMethod,
          group_id: groupId,
        },
        { transaction: t },
      )
    } else {
      throw new Error("Invalid payment method.")
    }

    const group = await CreateGroups.findOne({
      where: { group_id: groupId },
      transaction: t,
    })

    if (!group) {
      throw new Error("Group not found during join completion.")
    }

    const newSlotTaken = group.slotTaken + slots
    const newTotalSlotLeft = group.totalSlot - newSlotTaken
    const newFinalSlotPriceTaken = group.finalSlotPriceTaken + finalPaymentAmount
    const newTotalSlotPriceLeft = group.totalSlotPriceLeft - finalPaymentAmount
    const status = newTotalSlotLeft === 0 ? "completed" : "active"

    await CreateGroups.update(
      {
        slotTaken: newSlotTaken,
        totalSlotLeft: newTotalSlotLeft,
        finalSlotPriceTaken: newFinalSlotPriceTaken,
        totalSlotPriceLeft: newTotalSlotPriceLeft,
        status,
      },
      {
        where: { group_id: groupId },
        transaction: t,
      },
    )

    await joinGroups.create(
      {
        join_id: uuidv4(),
        group_id: groupId,
        user_id,
        slots,
        status: "approved",
        payment_reference: paymentReference,
        joined_at: new Date(),
      },
      { transaction: t },
    )

    await PendingPayments.destroy({
      where: { user_id, paymentReference: paymentReference || null, actionType: "JOIN_GROUP" },
      transaction: t,
    })

    await t.commit()

    return res.status(200).json({
      status: "success",
      message: "Successfully joined group!",
      group_id: groupId,
      slots,
    })
  } catch (error) {
    await t.rollback()
    console.error("Error in completeJoinGroup:", error)
    return res.status(400).json({
      status: "error",
      message: error.message || "Failed to complete join group request.",
    })
  }
}

const startWalletFunding = async (req, res) => {
  try {
    const { email } = req.user
    const { amount } = req.body

    if (amount < 100) throw new Error("Amount must be at least ₦100") // Changed from 1000 to 100

    const frontendBaseUrl = process.env.FRONTEND_BASE_URL || "http://localhost:3000"
    const callbackUrl = `${frontendBaseUrl}/dashboard/wallet/complete`

    const paystackResponse = await initializePayment(email, amount, callbackUrl)

    if (
      !paystackResponse ||
      !paystackResponse.data ||
      !paystackResponse.data.data ||
      !paystackResponse.data.data.authorization_url
    ) {
      console.error("Backend: Unexpected Paystack initializePayment response structure:", paystackResponse)
      throw new Error("Failed to get payment authorization URL from Paystack. Please try again.")
    }

    res.status(200).json({
      status: "success",
      message: "Payment initialized successfully",
      data: {
        payment_url: paystackResponse.data.data.authorization_url,
        access_code: paystackResponse.data.data.reference,
      },
    })
  } catch (error) {
    console.error("Error in startWalletFunding:", error)
    res.status(400).json({
      status: "error",
      message: error.message,
    })
  }
}

const completWalletFunding = async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const { user_id, email } = req.user
    const { reference } = req.params

    const transactionExists = await Transactions.findOne({
      where: { payment_reference: reference, status: "success" },
      transaction: t,
    })
    if (transactionExists) {
      throw new Error("Transaction already processed.")
    }

    const response = await verifyPayment(reference)
    if (response.data.data.status !== "success") {
      throw new Error("Invalid transaction or payment failed")
    }

    const amountInNaira = response.data.data.amount / NAIRA_CONVERSION

    const wallet = await Wallets.findOne({ where: { user_id: user_id } }, { transaction: t })

    if (!wallet) {
      throw new Error("Wallet not found for user.")
    }

    await Transactions.create(
      {
        transaction_id: uuidv4(),
        user_id: user_id,
        wallet_id: wallet.wallet_id,
        payment_reference: reference,
        email: email,
        description: "wallet funding",
        transaction_type: "credit",
        payment_means: "others",
        amount: amountInNaira,
        status: "success",
      },
      { transaction: t },
    )

    const updateAmount = Number(wallet.balance) + amountInNaira
    await Wallets.update({ balance: updateAmount }, { where: { user_id: user_id }, transaction: t })

    await t.commit()

    res.status(200).json({
      status: "success",
      message: "Wallet successfully funded",
    })
  } catch (error) {
    await t.rollback()
    console.error("Error in completWalletFunding:", error)
    res.status(400).json({
      status: "error",
      message: error.message,
    })
  }
}

const getWalletBalance = async (req, res) => {
  try {
    const { user_id } = req.user
    const wallet = await Wallets.findOne({ where: { user_id: user_id } })
    if (!wallet) throw new Error("Wallet not found")

    res.status(200).json({
      status: "success",
      message: "Wallet balance retrieved successfully",
      data: { balance: Number.parseFloat(wallet.balance) },
    })
  } catch (error) {
    console.error("Error in getWalletBalance:", error)
    return res.status(500).json({
      status: "error",
      message: error.message,
    })
  }
}

const getWalletTransactions = async (req, res) => {
  try {
    const { user_id } = req.user
    const wallet = await Wallets.findOne({ where: { user_id } })
    if (!wallet) {
      return res.status(404).json({ status: "error", message: "Wallet not found." })
    }

    const transactions = await Transactions.findAll({
      where: { wallet_id: wallet.wallet_id },
      order: [["created_at", "DESC"]],
    })

    res.status(200).json({
      status: "success",
      message: "Wallet transactions retrieved successfully",
      data: transactions,
    })
  } catch (error) {
    console.error("Error in getWalletTransactions:", error)
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to retrieve wallet transactions.",
    })
  }
}

const createLivestock = async (req, res) => {
  try {
    //check if user is admin
    if (req.user.role !== "admin") throw new Error("Access denied. Admin only");

    const { error } = createLivestockValidation(req.body);
    const { user_id } = req.user;
    if (error) throw new Error(error.details[0].message);
    const { name, price, description, available, imageUrl, minimum_amount } =
      req.body;

    //check if livestock with the same name already exists
    const existingLivestock = await Livestocks.findOne({
      where: { name: name },
    });
    if (existingLivestock)
      throw new Error("Livestock with the same name already exists");

    const newLivestock = await Livestocks.create({
      livestock_id: uuidv4(),
      name,
      price,
      description,
      available,
      user_id,
      imageUrl,
      minimum_amount,
    });
    return res.status(200).json({
      message: "Livestock created successfully",
      livestock: newLivestock,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getMyCreatedGroups = async (req, res) => {
  try {
    const { user_id } = req.user

    console.log("Backend: getMyCreatedGroups - Fetching groups created by user_id:", user_id)

    const createdGroups = await CreateGroups.findAll({
      where: { created_by: user_id },
      include: [
        {
          model: Livestocks,
          as: "livestock",
          attributes: ["livestock_id", "name", "price", "minimum_amount", "imageUrl"],
        },
      ],
      order: [["created_at", "DESC"]], // Show newest first
    })

    console.log("Backend: getMyCreatedGroups - Found groups:", createdGroups.length)

    // Calculate progress for each group
    const formattedGroups = createdGroups.map((group) => {
      const progress = group.totalSlot > 0 ? (group.slotTaken / group.totalSlot) * 100 : 0
      return {
        ...group.toJSON(),
        progress: progress,
      }
    })

    res.status(200).json({
      status: "success",
      message: "Created groups retrieved successfully",
      data: formattedGroups,
    })
  } catch (error) {
    console.error("Error in getMyCreatedGroups:", error.message, error.stack)
    res.status(500).json({
      status: "error",
      message: error.message,
    })
  }
}

// Get groups the user has joined (not created)
const getMyJoinedGroups = async (req, res) => {
  try {
    const { user_id } = req.user

    console.log("Backend: getMyJoinedGroups - Fetching joined groups for user_id:", user_id)

    const userParticipations = await joinGroups.findAll({
      where: { user_id: user_id },
      include: [
        {
          model: CreateGroups,
          as: "group",
          where: {
            created_by: { [require("sequelize").Op.ne]: user_id }, // Exclude groups created by the user
            status: "active", // Only show active groups
          },
          attributes: [
            "group_id",
            "groupName",
            "description",
            "totalSlot",
            "slotTaken",
            "slotPrice",
            "finalSlotPriceTaken",
            "totalSlotLeft",
            "totalSlotPriceLeft",
            "status",
            "created_by",
          ],
          include: [
            {
              model: Livestocks,
              as: "livestock",
              attributes: ["livestock_id", "name", "price", "minimum_amount", "imageUrl"],
            },
          ],
        },
      ],
    })

    console.log("Backend: getMyJoinedGroups - Found participations:", userParticipations.length)

    // Format data and calculate progress
    const formattedParticipations = userParticipations
      .map((participation) => {
        const group = participation.group
        if (!group) {
          return null
        }
        const progress = (group.slotTaken / group.totalSlot) * 100
        return {
          ...group.toJSON(),
          progress: progress,
          userSlots: participation.slots, // Add user's slot count
          joinedAt: participation.joined_at,
        }
      })
      .filter(Boolean)

    res.status(200).json({
      status: "success",
      message: "Joined groups retrieved successfully",
      data: formattedParticipations,
    })
  } catch (error) {
    console.error("Error in getMyJoinedGroups:", error.message, error.stack)
    res.status(400).json({
      status: "error",
      message: error.message,
    })
  }
}

const deleteGroup =async(req, res) => {
  try{
    const { groupId } = req.params;
    const userId = req.user.id;
    const group = await CreateGroups.findById(groupId);
    if(!group) {

      throw new Error ("Group not found")
    }
    if (group.created_by !== userId){
      throw new Error ('You do not have permission to delete this group')
    }

    if (group.status === 'pending' || group.status === 'draft') {
       await CreateGroups.findByIdAndDelete(groupId);
       return true
    } else if(group.status === "active") {
      const memberCount = await joinGroups.countDocuments({ groupId: groupId });
      
      if (memberCount > 1) {
        throw new Error ('Cannot delete group with active members. Please remove all members first.')
      }
    }

    return res.status(200).json({
        status: 'success',
        message: 'Group deleted successfully'
      });


  } catch (error){
    console.error('Error deleting group:', error);
    return res.status(400).json({
      status: 'error',
      message: 'Internal server error while deleting group'
    });

  }
}

module.exports = {
  createUser,
  verifyEmail,
  login,
  getUser,
  updateUser,
  startForgotPassword,
  completeForgotPassword,
  createLivestock,
  getAvailableLivestocks,
  getWalletBalance,
  getWalletTransactions,
  startWalletFunding,
  completWalletFunding,
  resendOtp,
  completeCreateGroup,
  startCreateGroup,
  startJoinGroup,
  completeJoinGroup,
  getMyGroups,
  getActiveGroups,
  getGroupDetails,
  getMyCreatedGroups,
  getMyJoinedGroups,
  deleteGroup
};








