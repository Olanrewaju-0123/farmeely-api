const axios = require("axios");
const TO_KOBO = 100;

const initializePayment = async (email, amount, callback_url) => {
  try {
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

      if (callback_url) {
      data.callback_url = callback_url
    }
    });
    
  } catch (error) {
    console.error("Error initializing Paystack payment:", error.response ? error.response.data : error.message)
    throw new Error(error.response?.data?.message || "Failed to initialize payment with Paystack.")
  }
};

const verifyPayment = async (reference) => {
  try {
    return await axios({
      method: "get",
      url: `https://api.paystack.co/transaction/verify/${reference}`,
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_API_SECRET_KEY}`,
      },
    });
    
  } catch (error) {
    console.error("Error verifying Paystack payment:", error.response ? error.response.data : error.message)
    throw new Error(error.response?.data?.message || "Failed to verify payment with Paystack.")
  }
};

module.exports = {
  initializePayment,
  verifyPayment,
};
