require('dotenv').config();

const express = require("express");
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { HoldingsModel } = require("./model/HoldingsModel.js");
const { PositionsModel } = require("./model/PositionsModel.js");
const { OrdersModel } = require("./model/OrdersModel.js");
const { UsersModel } = require("./model/UsersModel.js");

const PORT = process.env.PORT || 3002;
const uri = process.env.MONGO_URL;

const app = express();
app.use(cors());
app.use(bodyParser.json());

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).send("No token");

  try {
    const decoded = jwt.verify(token, "SECRET_KEY");
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).send("Invalid token");
  }
};

app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await UsersModel.findOne({ email });
    if (existingUser) return res.status(400).send("User already exists");

    const hashedPassword = await bcrypt.hash(password, 10);

    await UsersModel.create({ name, email, password: hashedPassword });

    res.status(201).json({ message: "User created successfully" });
  } catch {
    res.status(500).send("Server error");
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await UsersModel.findOne({ email });
    if (!user) return res.status(400).send("Invalid email or password");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send("Invalid email or password");

    const token = jwt.sign({ id: user._id }, "SECRET_KEY", { expiresIn: "1d" });

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch {
    res.status(500).send("Server error");
  }
});

app.get('/allHoldings', authMiddleware, async (req, res) => {
  const holdings = await HoldingsModel.find({ user: req.userId });

  const updated = holdings.map(h => {
    const net = ((h.price - h.avg) / h.avg) * 100;
    const pnl = (h.price - h.avg) * h.qty;

    return {
      ...h._doc,
      net: Number(net.toFixed(2)),
      pnl: Number(pnl.toFixed(2)),
    };
  });

  res.json(updated);
});

app.get('/allPositions', authMiddleware, async (req, res) => {
  const positions = await PositionsModel.find({ user: req.userId });

  const updated = positions.map(p => {
    const net = ((p.price - p.avg) / p.avg) * 100;
    const pnl = (p.price - p.avg) * p.qty;

    return {
      ...p._doc,
      net: Number(net.toFixed(2)),
      pnl: Number(pnl.toFixed(2)),
    };
  });

  res.json(updated);
});
app.get("/holding/:uid", authMiddleware, async (req, res) => {
  try {
    const { uid } = req.params;

    const holding = await HoldingsModel.findOne({
      name: uid,
      user: req.userId
    });

    if (!holding) {
      return res.json({ qty: 0 }); 
    }

    res.json({ qty: holding.qty });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
app.post('/newOrder', authMiddleware, async (req, res) => {
  try {
    const { name, qty, price, mode, product } = req.body;

    const quantity = Number(qty);
    const stockPrice = Number(price);

    await OrdersModel.create({
      name,
      qty: quantity,
      price: stockPrice,
      mode,
      product,
      user: req.userId
    });

    // ================= CNC (DELIVERY) =================
    if (product === "CNC") {
      let holding = await HoldingsModel.findOne({
        name,
        user: req.userId
      });

      if (mode === "BUY") {
        if (holding) {
          const newQty = holding.qty + quantity;
          const newAvg =
            (holding.qty * holding.avg + quantity * stockPrice) / newQty;

          holding.qty = newQty;
          holding.avg = newAvg;
          holding.price = stockPrice;

          await holding.save();
        } else {
          await HoldingsModel.create({
            name,
            qty: quantity,
            avg: stockPrice,
            price: stockPrice,
            user: req.userId
          });
        }
      }

      else if (mode === "SELL") {
        if (!holding || holding.qty < quantity) {
          return res.status(400).json({ error: "Not enough quantity" });
        }

        holding.qty -= quantity;
        holding.price = stockPrice;

        if (holding.qty === 0) {
          await HoldingsModel.deleteOne({ name, user: req.userId });
        } else {
          await holding.save();
        }
      }
    }

    // ================= MIS (INTRADAY) =================
    else if (product === "MIS") {
      let position = await PositionsModel.findOne({
        name,
        user: req.userId
      });

      if (mode === "BUY") {
        if (position) {
          const newQty = position.qty + quantity;
          const newAvg =
            (position.qty * position.avg + quantity * stockPrice) / newQty;

          position.qty = newQty;
          position.avg = newAvg;
          position.price = stockPrice;

          await position.save();
        } else {
          await PositionsModel.create({
            product,
            name,
            qty: quantity,
            avg: stockPrice,
            price: stockPrice,
            user: req.userId
          });
        }
      }

      else if (mode === "SELL") {
        if (!position || position.qty < quantity) {
          return res.status(400).json({ error: "Not enough quantity" });
        }

        position.qty -= quantity;
        position.price = stockPrice;

        if (position.qty === 0) {
          await PositionsModel.deleteOne({ name, user: req.userId });
        } else {
          await position.save();
        }
      }
    }

    res.json({ message: "Order processed successfully" });

  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/allOrders", authMiddleware, async (req, res) => {
  try {
    const orders = await OrdersModel
      .find({ user: req.userId })
      .sort({ _id: -1 }); 
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/prices", async (req, res) => {
  try {
    const { symbols } = req.query;

    const response = await axios.get(
      "http://api.marketstack.com/v1/eod/latest",
      {
        params: {
          access_key: process.env.MARKETSTACK_KEY,
          symbols
        }
      }
    );

    res.json(response.data);

  } catch (err) {
    res.status(500).json({ error: "Failed to fetch prices" });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.listen(PORT, async () => {
  console.log("Server started on port", PORT);
  await mongoose.connect(uri);
  console.log("MongoDB connected");
});