const heartbeat = require("../controllers/heartbeat"),
  vote = require("../controllers/vote"),
  trafficLog = require("../controllers/traffic_log"),
  state = require("../controllers/state"),
  { nodes, registerNode } = require("../controllers/nodes");

const cache = require("../middlewares/cache");
module.exports = function (app) {
  app.get("/", heartbeat);
  app.get("/nodes", nodes);
  app.get("/trafficlog", trafficLog.getTrafficLog);
  app.get("/state/current/", cache, state.getCurrentState);
  // app.get("/state/projected/", state.getProjectedState);
  // app.get("/state/pending/", state.getPendingState);
  app.get("/state/getCurrentStateCached", state.getCurrentStateCached);
  app.post("/", vote);
  app.post("/register-node", registerNode);
};
