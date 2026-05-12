const { model }= require("mongoose");

const {OrdersSchema}= require('../schema/OrdersSchema.js');

const OrdersModel= new model("order", OrdersSchema);

module.exports= {OrdersModel}