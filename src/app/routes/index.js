const heartbeat = require("../controllers/heartbeat"),
  submitVote = require("../controllers/submit_vote"),
  {
    getCurrentState,
    getCurrentStateCached,
    getCurrentStatePredicted,
    getTopContentPredicted,
    getNFTState,
    handleNFTUpload
  } = require("../controllers/state"),
  { nodes, registerNode } = require("../controllers/nodes"),
  cache = require("../middlewares/cache");

module.exports = function (app) {
  app.get("/", heartbeat);
  app.get("/nodes", nodes);
  app.get("/state/current", getCurrentState);
  app.get("/state/current-cached", getCurrentStateCached);
  app.get("/state/current-predicted", getCurrentStatePredicted);
  app.get("/state/top-content-predicted", getTopContentPredicted);
  app.get("/state/nft", cache, getNFTState);
  app.post("/handle-nft-upload", handleNFTUpload);
  app.post("/submit-vote", submitVote);
  app.post("/register-node", registerNode);
};
