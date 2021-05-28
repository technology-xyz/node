/**
 * Main entry point for service (bundler) node
 */
function service() {
  // Require dynamically to reduce RAM and load times for witness
  require("dotenv").config();
  const express = require("express");
  const cors = require("cors");
  const cookieParser = require("cookie-parser");

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

  // Update state cache every 5 minutes
  const updateStateCache = require("./app/helpers/update_state_cache");
  setInterval(updateStateCache, 300000);
  updateStateCache().then(() => {
    console.log("Initial state cache populated");
  });
}

module.exports = service;
