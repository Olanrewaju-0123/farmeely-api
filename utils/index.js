const bcrypt = require("bcrypt");
const { Wallets } = require("../models/walletModel");
const { paymentMeans } = require("../enum");
const saltRounds = 10;
const { v4: uuidv4 } = require("uuid");
const sequelize = require("../config/sequelize");
const { Transactions } = require("../models/transactionModel");
const { initializePayment, verifyPayment  } = require("../services/paymentGateway");

const hashPassword = async (password) => {
  return new Promise((resolve, reject) => {
    bcrypt.genSalt(saltRounds, (err, salt) => {
      if (err) reject(err);
      bcrypt.hash(password, salt, (err, hash) => {
        if (err) reject(err);
        resolve([hash, salt]);
      });
    });
  });
};

// Generate Otp
// const generateOtp = () => {
//   return Math.floor(100000 + Math.random() * 900000);
// };

const generateOtp = (minutes = 10) => {
  const otp = Math.floor(Math.random() * 900000) + 100000; 
  const expiresAt = new Date(Date.now() + minutes * 60000);
  return { otp, expiresAt };
};


const debitWallet = async (amount, user_id, email, description) => {
  try {
    const transaction_reference = uuidv4();
    await sequelize.transaction(async (t) => {
      const wallet = await Wallets.findOne({
        where: { user_id: user_id },
        transaction: t,
      });

      if (wallet == null) throw new Error("Wallet not found");
      const walletBalance = Number(wallet.balance);
      if (walletBalance - amount < 0) throw new Error("Insufficient Balance");
      const newBalance = walletBalance - amount;
      await Transactions.create(
        {
          transaction_id: uuidv4(),
          wallet_id: wallet.wallet_id,
          transaction_type: "debit",
          payment_reference: transaction_reference,
          payment_means: paymentMeans.WALLET,
          amount: amount,
          user_id: user_id,
          email: email,
          description: description,
        },
        { transaction: t }
      );
      await Wallets.update(
        { balance: newBalance },
        { where: { user_id: user_id }, transaction: t }
      );
    });
    return transaction_reference;
  } catch (error) {
    console.log("error", error);
    throw new Error(error.message);
  }
};

const creditWallet = async (amount, user_id, email, description) => {
  try {
    await sequelize.transaction(async (t) => {
      // credit the wallet and update the amount with the new value in sequelize
      const wallet = await Wallets.findOne(
        {
          where: { user_id: user_id },
        },
        { transaction: t }
      );
      const newBalance = Number(wallet.balance) + amount;
      await Transactions.create(
        {
          transaction_id: uuidv4(),
          wallet_id: wallet.wallet_id,
          transaction_type: "credit",
          payment_reference: uuidv4(),
          payment_means: paymentMeans.WALLET,
          amount: amount,
          email: email,
          status: "success",
          description: description,
        },
        { transaction: t }
      );
      await Wallets.update(
        { balance: newBalance },
        { where: { user_id: user_id }, transaction: t }
      );
      return true;
    });
  } catch (error) {
    return false;
  }
};

const checkTransactionStatus = async (reference) => {
  return await Transactions.findOne({
    where: { payment_reference: reference, status: "success" },
  });
};

const startTransaction = async ({
  amount,
  user_id,
  email,
  paymentMethod,
  description,
  paymentReference
}) => {
  if (paymentMethod === paymentMeans.WALLET) { 
    const transactionRef = await debitWallet(
      amount,
      user_id,
      email,
      description
    );
    if (!transactionRef) throw new Error("Insufficient wallet balance");
    return { paymentReference: transactionRef }; 
  } else if (paymentMethod === paymentMeans.OTHERS) {
    if (paymentReference) {
      // Verify existing payment
      const existingTransaction = await checkTransactionStatus(paymentReference);
      if (existingTransaction) throw new Error("Payment reference already used");
      
      const verification = await verifyPayment(paymentReference);
      if (verification.data.data.status !== "success") throw new Error("Payment verification failed");
      
      return { paymentReference };
    } else {
      // Initialize new payment
      const response = await initializePayment(email, amount);
      const { authorization_url, reference } = response.data.data;
      return { paymentLink: authorization_url, paymentReference: reference };
    }
  }
  throw new Error("Invalid Payment method");
};
const completeTransaction = async ({ sequelizeTransaction, success }) => {
  if (!sequelizeTransaction) return;
  if (success) {
    await sequelizeTransaction.commit();
  } else {
    await sequelizeTransaction.rollback();
  }
};


module.exports = {
  hashPassword,
  generateOtp,
  debitWallet,
  creditWallet,
  checkTransactionStatus,
  startTransaction,
  completeTransaction
};
