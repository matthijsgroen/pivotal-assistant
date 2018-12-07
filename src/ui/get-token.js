const blessed = require("blessed");
const util = require("util");
const readFile = util.promisify(require("fs").readFile);
const writeFile = util.promisify(require("fs").writeFile);
const stat = util.promisify(require("fs").stat);
const homedir = require("os").homedir();

const folderPreferences = [process.env.XDG_CONFIG_HOME, homedir].filter(
  Boolean
);

const getOrAskTrackerToken = async (parent, theme, path) => {
  for (const folder of folderPreferences) {
    const fullPath = folder + (folder.endsWith("/") ? "" : "/") + path;
    try {
      const fileStats = await stat(fullPath);
      if (fileStats.isFile()) {
        const data = JSON.parse(await readFile(fullPath, "utf8"));
        if (data.hasOwnProperty("apiKey")) {
          return data;
        }
      }
    } catch (e) {}
  }

  return new Promise(resolve => {
    const form = blessed.form({
      ...theme.BOX_STYLING,
      top: "center",
      left: "center",
      keys: true
    });
    blessed.text({
      parent: form,
      keyable: false,
      content: "Pivotal tracker API key",
      style: theme.TEXT_STYLING
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
      style: theme.BUTTON_STYLING
    });
    submit.on("press", () => form.submit());

    form.on("submit", async data => {
      form.destroy();
      parent.render();
      const fileData = {
        apiKey: data.apiKey
      };
      for (const folder of folderPreferences) {
        const fullPath = folder + (folder.endsWith("/") ? "" : "/") + path;
        try {
          await writeFile(fullPath, JSON.stringify(fileData), "utf8");
          resolve(fileData);
          break;
        } catch (e) {}
      }
    });
    form.focus();
    parent.append(form);
    parent.render();
  });
};

module.exports = {
  getOrAskTrackerToken
};
