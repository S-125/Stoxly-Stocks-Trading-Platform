const { Schema } = require('mongoose');

const PositionsSchema = new Schema({
  product: {
    type: String,
    enum: ["CNC", "MIS"],
    required: true
  },

  name: {
    type: String,
    required: true
  },

  qty: {
    type: Number,
    required: true
  },

  avg: {
    type: Number,
    required: true
  },

  price: {
    type: Number,
    required: true
  },

  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  }

}, {
  timestamps: true   
});

module.exports = { PositionsSchema };