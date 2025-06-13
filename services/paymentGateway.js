const axios = require("axios");
const TO_KOBO = 100;

const initailizePayment = async (email, amount) => {
  return await axios({
    method: "post",
    url: "https://api.paystack.co/transaction/initialize",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_API_SECRET_KEY}`,
    },
    data: {
      email: email,
      amount: amount * TO_KOBO,
    },
  });
};

const verifyPayment = async (reference) => {
  return await axios({
    method: "get",
    url: `https://api.paystack.co/transaction/verify/${reference}`,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_API_SECRET_KEY}`,
    },
  });
};

module.exports = {
  initailizePayment,
  verifyPayment,
};
