const fetch = require("node-fetch");

module.exports = async (port) => {
  fetch(`http://localhost:${port}/state/current?nocache=true`)
    .then(() => {
      console.log("Cache currentState Updated");
    })
    .catch((e) => {
      console.log(e);
    });
  fetch(`http://localhost:${port}/state/getTopContent?nocache=true`)
    .then(() => {
      console.log("Cache getTopContent Updated");
    })
    .catch((e) => {
      console.log(e);
    });
};
