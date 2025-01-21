const express = require("express");
const app = express();
const path = require("path");
const cors = require("cors");
require("dotenv").config();

app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));


app.listen(3000, () => {
  console.log("Server is running on port 3000");
});