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
    top: 1,
    bottom: 1,
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

module.exports = {
  TEXT_STYLING,
  BOX_STYLING,
  BUTTON_STYLING
};
