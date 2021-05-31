const { vote, heartbeat, trafficLog, state } = require("../controllers");
const cache = require("../middlewares/cache");
module.exports = function (app) {
  app.get("/", heartbeat);
  app.get("/trafficlog", trafficLog.getTrafficLog);
  app.get("/state/current/", cache, state.getCurrentState);
  // app.get("/state/projected/", state.getProjectedState);
  // app.get("/state/pending/", state.getPendingState);
  app.get("/state/getCurrentStateCached", state.getCurrentStateCached);
  app.post("/", vote);
};
