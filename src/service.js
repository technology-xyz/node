function service() {
  // Require dynamically to reduce RAM and load times for witness
  const express = require("express");
  const cors = require("cors");
  const cookieParser = require("cookie-parser");
  require("dotenv").config();

  // Setup middleware and routes
  const app = express();
  app.use(cors());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieParser());
  require("./app/routes")(app);

  // Start the server
  const port = process.env.SERVER_PORT || 8887;
  app.listen(port, () => {
    console.log("Open http://localhost:" + port, "to view in browser");
  });

  // If we need to update cache on a timer, use setInterval(), NOT cron
}

module.exports = service;
