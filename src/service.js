"use strict";

// Try using setTimer instead of cron

function service(walletPath) {
  const express = require("express");
  const cors = require("cors");
  const cookieParser = require("cookie-parser");
  const bodyParser = require("body-parser");
  require("dotenv").config();

  const app = express();
  app.use(cors());

  // Include middleware
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  app.use(cookieParser());

  // Api Doc
  // app.use("/apiDocs", swaggerUi.serve, swaggerUi.setup(openApiDocumentation));

  // Require routes
  require("./app/routes")(app);
  app.get("/testEndpoint", (req, res) => {
    res.send("RECEIVED FROM BUNDLER");
  });

  const port = process.env.SERVER_PORT || 8887;
  // Start the server

  if (process.env.NODE_ENV != "test") {
    app.listen(port, () => {
      console.log("Server running on port " + port);
      console.log(
        "Open http://localhost:" +
          port +
          "/ to view the heartbeat and test browser access!"
      );

      // setTimeout(() => {
      // 	ProcessUtil.start()
      // }, 6000)
    });
  }

  require("./app/helpers/populateCurrentStateCached")();
  // Adding Cron Job to fill Cache before it invalidates data
  const cron = require("node-cron");
  const updateCache = require("./app/helpers/updateCache");

  cron.schedule(" */5 * * * *", () => {
    console.log("Updating cache every 5 minutes");
    updateCache(port);
  });
}

module.exports = service;
