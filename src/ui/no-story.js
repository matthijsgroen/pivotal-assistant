const blessed = require("blessed");

const buildNoStoryUI = (theme, parent, message) => {
  const storyScreen = blessed.box({
    parent,
    ...theme.BOX_STYLING,
    top: "center",
    left: "center",
    width: "100%",
    height: "100%",
    scrollable: true
  });
  blessed.text({
    parent: storyScreen,
    keyable: false,
    tags: true,
    content: `{center}${message}{/center}\n`,
    style: theme.TEXT_STYLING
  });
  return storyScreen;
};

module.exports = {
  buildNoStoryUI
};
