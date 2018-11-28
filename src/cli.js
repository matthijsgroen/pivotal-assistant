const blessed = require("blessed");
const util = require("util");
const readFile = util.promisify(require("fs").readFile);
const writeFile = util.promisify(require("fs").writeFile);
const homedir = require("os").homedir();
const https = require("https");

const screen = blessed.screen({
  smartCSR: true
});

const TEXT_STYLING = {
  fg: "#F1F0E3",
  bg: "#464D55"
};

const BUTTON_STYLING = {
  fg: "#F1F0E3",
  bg: "#213F63",
  focus: {
    bg: "#242D50"
  }
};

const BOX_STYLING = {
  padding: {
    top: 2,
    bottom: 2,
    left: 4,
    right: 4
  },
  border: {
    type: "line"
  },
  style: {
    ...TEXT_STYLING,
    border: {
      fg: "#666666",
      bg: "#464D55"
    },
    hover: {
      bg: "green"
    }
  }
};
screen.title = "Pivotal assistant";

// Quit on Escape, q, or Control-C.
screen.key(["escape", "q", "C-c"], function(ch, key) {
  return process.exit(0);
});

const showMessage = async text =>
  new Promise(resolve => {
    const message = blessed.message({
      ...BOX_STYLING,
      top: "center",
      left: "center"
    });
    screen.append(message);
    message.display(text, 0, () => resolve());
    screen.render();
  });

const fileOrExit = async (path, message) => {
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    await showMessage(message);
    process.exit(1);
  }
};

const getOrAskTrackerToken = async path => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    return new Promise(resolve => {
      const form = blessed.form({
        ...BOX_STYLING,
        top: "center",
        left: "center",
        keys: true
      });
      blessed.text({
        parent: form,
        keyable: false,
        content: "Pivotal tracker API key",
        style: TEXT_STYLING
      });
      const apiKeyInput = blessed.textbox({
        parent: form,
        mouse: true,
        keys: true,
        name: "apiKey",
        inputOnFocus: true,
        top: 2,
        height: 1,
        censor: true,
        style: {
          fg: "#ffffff",
          bg: "#222222",
          focus: {
            bg: "#000000"
          }
        }
      });
      const submit = blessed.button({
        parent: form,
        content: "Submit",
        shadow: true,
        top: 8,
        height: 1,
        width: "shrink",
        padding: { left: 1, right: 1 },
        left: "center",
        mouse: true,
        keys: true,
        name: "submit",
        style: BUTTON_STYLING
      });
      submit.on("press", () => form.submit());

      form.on("submit", async data => {
        form.destroy();
        screen.render();
        await writeFile(path, JSON.stringify(data), "utf8");
        resolve(data);
      });
      form.focus();
      screen.append(form);
      screen.render();
    });
  }
};

const createDataFetcher = apiToken => {
  return async apiPath =>
    new Promise((resolve, reject) => {
      https.get(
        `https://www.pivotaltracker.com/services/v5${apiPath}`,
        {
          headers: {
            "X-TrackerToken": apiToken
          }
        },
        response => {
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
        }
      );
    });
};

const run = async () => {
  const gitHead = await fileOrExit(
    ".git/HEAD",
    "Please run this from the git root of your project"
  );
  const trackerData = await getOrAskTrackerToken(`${homedir}/.pt.json`);
  const apiToken = trackerData.apiKey;
  const fetchPivotalData = createDataFetcher(apiToken);

  const data = await fetchPivotalData("/me");
  console.log(data.projects.map(p => p.project_name));
};
run();
