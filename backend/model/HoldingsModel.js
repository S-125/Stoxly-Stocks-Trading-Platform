const { model }= require("mongoose");

const {HoldingsSchema}= require('../schema/HoldingsSchema.js');

const HoldingsModel= new model("holding", HoldingsSchema);

module.exports= {HoldingsModel}