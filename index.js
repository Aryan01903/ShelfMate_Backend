const express = require("express");
const mongoose = require("mongoose");
const app = express();
require("dotenv").config();

const cors = require("cors");
app.use(cors({ origin: "*" }));
app.use(express.json());

let dbConnected = false;

mongoose
  .connect(process.env.DB_URL)
  .then(() => {
    dbConnected = true;
    console.log("Successfully connected to Database");
  })
  .catch((err) => {
    dbConnected = false;
    console.log("Error occurred while connecting to the Database:", err.message);
  });

app.get("/status", (req, res) => {
  if (dbConnected) {
    return res.status(200).json({
      status: "OK",
      server: "Running",
      database: "Connected",
    });
  }

  return res.status(503).json({
    status: "NOT OK",
    server: "Running",
    database: "Disconnected",
  });
});

const authRoutes = require("./routes/auth_route");
authRoutes(app);

const bookRoutes = require("./routes/book_route");
bookRoutes(app);

app.listen(process.env.PORT, () => {
  console.log(
    "Successfully started the server on PORT:",
    process.env.PORT
  );
});