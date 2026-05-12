const { model }= require("mongoose");

const {UsersSchema}= require('../schema/UsersSchema.js');

const UsersModel= new model("user", UsersSchema);

module.exports= {UsersModel}