const https = require("https");

const createResponseHandler = (resolve, reject) => response => {
  if (response.statusCode >= 400 && response.statusCode < 600) {
    reject(new Error(`Request returned ${response.statusCode}`));
    return;
  }
  let data = "";
  response.on("data", chunk => {
    data += chunk;
  });
  response.on("end", () => {
    try {
      const struct = JSON.parse(data);
      resolve(struct);
    } catch (e) {
      reject(e);
    }
  });
};

const path = apiPath => `https://www.pivotaltracker.com/services/v5${apiPath}`;

const createAPIFunctions = apiToken => ({
  get: async apiPath =>
    new Promise((resolve, reject) => {
      https.get(
        path(apiPath),
        {
          headers: {
            "X-TrackerToken": apiToken
          }
        },
        createResponseHandler(resolve, reject)
      );
    })
});

module.exports = {
  createAPIFunctions
};
