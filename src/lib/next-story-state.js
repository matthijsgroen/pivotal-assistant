const getNextStoryState = story => {
  // accepted, delivered, finished, started, rejected, planned, unstarted, unscheduled
  const startable =
    (story.story_type === "bug" &&
      ["unscheduled", "unstarted", "planned"].includes(story.current_state)) ||
    (story.story_type === "feature" &&
      ["unscheduled", "unstarted", "planned"].includes(story.current_state) &&
      story.estimate !== undefined) ||
    (story.story_type === "chore" &&
      ["unscheduled", "unstarted", "planned"].includes(story.current_state));

  if (startable) {
    return {
      label: "Start",
      style: {
        fg: "black",
        bg: "white"
      },
      value: "started"
    };
  }
  const finishable =
    (story.story_type === "bug" && story.current_state === "started") ||
    (story.story_type === "feature" && story.current_state === "started");
  const completable =
    story.story_type === "chore" && story.current_state === "started";

  if (finishable || completable) {
    return {
      label: "Finish",
      style: {
        fg: "white",
        bg: "#213F63"
      },
      value: completable ? "accepted" : "finished"
    };
  }

  const deliverable =
    (story.story_type === "bug" && story.current_state === "finished") ||
    (story.story_type === "feature" && story.current_state === "finished");

  if (deliverable) {
    return {
      label: "Deliver",
      style: {
        fg: "black",
        bg: "#FF9225"
      },
      value: "delivered"
    };
  }

  const accepted = story.current_state === "accepted";
  const estimatable =
    story.story_type === "feature" && story.estimate === undefined;

  return {
    label: accepted ? "Accepted" : estimatable ? "Unestimated" : "Start",
    style: {
      fg: "grey",
      bg: "white"
    },
    value: null
  };
};

module.exports = {
  getNextStoryState
};
