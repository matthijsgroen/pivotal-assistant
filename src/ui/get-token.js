const blessed = require("blessed");
const util = require("util");
const readFile = util.promisify(require("fs").readFile);
const writeFile = util.promisify(require("fs").writeFile);

const getOrAskTrackerToken = async (parent, theme, path) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
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
        await writeFile(path, JSON.stringify(data), "utf8");
        resolve(data);
      });
      form.focus();
      parent.append(form);
      parent.render();
    });
  }
};

module.exports = {
  getOrAskTrackerToken
};
