const { CreateGroups } = require("./createGroupModel");
const { joinGroups } = require("./joinGroupModel");
const { Livestocks } = require("./livestockModel");
const { Users } = require("./userModel");
const { Wallets } = require("./walletModel");
const { Transactions } = require("./transactionModel");
const { Otp } = require("./otpModel");
const { ResetOtp } = require("./resetOtpModel");
const { PendingPayments } = require("./pendingPaymentModel");
const { UserTemp } = require("./userTemp");

// --- ADD THESE DEBUGGING LOGS ---
// console.log("--- Debugging Associations Imports ---");
// console.log("Users:", Users ? "Loaded" : "NOT Loaded", Users?.name);
// console.log("UserTemp:", UserTemp ? "Loaded" : "NOT Loaded", UserTemp?.name);
// console.log("Otp:", Otp ? "Loaded" : "NOT Loaded", Otp?.name);
// console.log("ResetOtp:", ResetOtp ? "Loaded" : "NOT Loaded", ResetOtp?.name);
// console.log(
//   "CreateGroups:",
//   CreateGroups ? "Loaded" : "NOT Loaded",
//   CreateGroups?.name
// );
// console.log(
//   "joinGroups:",
//   joinGroups ? "Loaded" : "NOT Loaded",
//   joinGroups?.name
// );
// console.log(
//   "Livestocks:",
//   Livestocks ? "Loaded" : "NOT Loaded",
//   Livestocks?.name
// );
// console.log("Wallets:", Wallets ? "Loaded" : "NOT Loaded", Wallets?.name);
// console.log(
//   "Transactions:",
//   Transactions ? "Loaded" : "NOT Loaded",
//   Transactions?.name
// );
// console.log(
//   "PendingPayments:",
//   PendingPayments ? "Loaded" : "NOT Loaded",
//   PendingPayments?.name
// );
// console.log("------------------------------------");
// --- END DEBUGGING LOGS ---

function defineAssociations() {
  // CreateGroups associations
  CreateGroups.belongsTo(Livestocks, {
    foreignKey: "livestock_id",
    targetKey: "sn",
    as: "livestock",
  });
  CreateGroups.belongsTo(Users, {
    foreignKey: "created_by",
    targetKey: "user_id",
    as: "creator",
  });
  CreateGroups.hasMany(joinGroups, {
    foreignKey: "group_id",
    sourceKey: "group_id",
    as: "participations",
  });

  // joinGroups associations
  joinGroups.belongsTo(CreateGroups, {
    foreignKey: "group_id",
    targetKey: "group_id",
    as: "group",
  });
  joinGroups.belongsTo(Users, {
    foreignKey: "user_id",
    targetKey: "user_id",
    as: "user",
  });

  // Users associations
  Users.hasOne(Wallets, {
    foreignKey: "user_id",
    sourceKey: "user_id",
    as: "wallet",
  });
  Users.hasMany(Transactions, {
    foreignKey: "user_id",
    sourceKey: "user_id",
    as: "transactions",
  });
  Users.hasMany(CreateGroups, {
    foreignKey: "created_by",
    sourceKey: "user_id",
    as: "createdGroups",
  });
  Users.hasMany(joinGroups, {
    foreignKey: "user_id",
    sourceKey: "user_id",
    as: "joinedGroups",
  });
  Users.hasMany(ResetOtp, {
    foreignKey: "user_id",
    sourceKey: "user_id",
    as: "resetOtps",
  });
  Users.hasMany(PendingPayments, {
    foreignKey: "user_id",
    sourceKey: "user_id",
    as: "pendingPayments",
  });

  // Wallets associations
  Wallets.belongsTo(Users, {
    foreignKey: "user_id",
    targetKey: "user_id",
    as: "user",
  });
  Wallets.hasMany(Transactions, {
    foreignKey: "wallet_id",
    sourceKey: "wallet_id",
    as: "transactions",
  });

  // Transactions associations
  Transactions.belongsTo(Users, {
    foreignKey: "user_id",
    targetKey: "user_id",
    as: "user",
  });
  Transactions.belongsTo(Wallets, {
    foreignKey: "wallet_id",
    targetKey: "wallet_id",
    as: "wallet",
  });

  // PendingPayments associations
  PendingPayments.belongsTo(Users, {
    foreignKey: "user_id",
    targetKey: "user_id",
    as: "user",
  });

  // Corrected: Associations for Otp and ResetOtp based on their model definitions
  UserTemp.hasMany(Otp, {
    foreignKey: "email",
    sourceKey: "email",
    as: "otps",
  });
  Otp.belongsTo(UserTemp, {
    foreignKey: "email",
    targetKey: "email",
    as: "temporaryUser",
  });

  ResetOtp.belongsTo(Users, {
    foreignKey: "email",
    targetKey: "email",
    as: "user",
  });
  
}

module.exports = defineAssociations;
