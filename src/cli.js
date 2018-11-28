const blessed = require("blessed");
const util = require("util");
const readFile = util.promisify(require("fs").readFile);

const screen = blessed.screen({
  smartCSR: true
});

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
    fg: "#F1F0E3",
    bg: "#464D55",
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

const run = async () => {
  try {
    const gitHead = await readFile(".git/HEAD", "utf8");
    console.log(gitHead);
    process.exit(0);
  } catch (e) {
    await showMessage("Please run this from the git root of your project");
    process.exit(1);
  }
};
run();
