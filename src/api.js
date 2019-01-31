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
      const struct = data.length > 0 ? JSON.parse(data) : null;
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
    }),
  post: async (apiPath, data) =>
    new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);
      const request = https.request(
        path(apiPath),
        {
          headers: {
            "X-TrackerToken": apiToken,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData)
          },
          method: "POST"
        },
        createResponseHandler(resolve, reject)
      );

      request.write(postData);
      request.end();
    }),
  put: async (apiPath, data) =>
    new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);
      const request = https.request(
        path(apiPath),
        {
          headers: {
            "X-TrackerToken": apiToken,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData)
          },
          method: "PUT"
        },
        createResponseHandler(resolve, reject)
      );

      request.write(postData);
      request.end();
    }),
  delete: async apiPath =>
    new Promise((resolve, reject) => {
      const request = https.request(
        path(apiPath),
        {
          headers: {
            "X-TrackerToken": apiToken,
            "Content-Type": "application/json"
          },
          method: "DELETE"
        },
        createResponseHandler(resolve, reject)
      );

      request.end();
    })
});

module.exports = {
  createAPIFunctions
};
