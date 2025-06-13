const Joi = require("joi");

const createUserValidation = (user) => {
    const schema = Joi.object({
        surname: Joi.string().required(),
        othernames: Joi.string().required(),
        email: Joi.string().email().required(),
        password: Joi.string().required(),
        phoneNumber: Joi.string().required(),
        location: Joi.string().required(),
        address: Joi.string().required(),
    });
    return schema.validate(user);
};

const updateUserValidation = (data) => {
    const userSchema = Joi.object({
        surname: Joi.string(),
        othernames: Joi.string(),
        phoneNumber: Joi.string(),
        location: Joi.string(),
        address: Joi.string(),
    })
    return userSchema.validate(data)
}

const createGroupValidation = (data) => {
    const groupSchema = Joi.object({
        groupName: Joi.string().required(),
        livestock_id: Joi.string().required(),
        paymentMethod: Joi.string().valid("wallet", "others").required(),
        totalSlot: Joi.number().integer().positive().required(),
        slotTaken: Joi.number().integer().positive().required(),
    })
    return groupSchema.validate(data)
}

const createLivestockValidation = () =>{
    const livestockSchema = Joi.object({
        livestock_id: Joi.string().required(),
        name:Joi.string().min().required(),
        breed:Joi.string().optional(),
        weight:Joi.number().positive().optional(),
        price:Joi.number().positive().required(),
        imageUrl:Joi.string().uri().optional(),
        description: Joi.string().optional(),
        available: Joi.boolean().default(true),
    })
    return livestockSchema.validate(data)
}

module.exports = { createUserValidation, updateUserValidation, createGroupValidation, createLivestockValidation };