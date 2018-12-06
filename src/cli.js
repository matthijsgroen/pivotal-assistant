const blessed = require("blessed");
const util = require("util");
const { watch } = require("fs");
const readFile = util.promisify(require("fs").readFile);
const writeFile = util.promisify(require("fs").writeFile);
const homedir = require("os").homedir();
const theme = require("./themes/pivotal");
const { createAPIFunctions } = require("./api");
const { buildNoStoryUI } = require("./ui/no-story");
const { chooseProject } = require("./ui/choose-project");
const { getOrAskTrackerToken } = require("./ui/get-token");

const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true
});

screen.title = "Pivotal assistant";

// Quit on Escape, q, or Control-C.
screen.key(["escape", "q", "C-c"], function(ch, key) {
  return process.exit(0);
});

const showMessage = async text =>
  new Promise(resolve => {
    const message = blessed.message({
      ...theme.BOX_STYLING,
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

const getNextState = story => {
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

const buildStoryUI = ({
  api,
  dataset,
  navigation,
  setNavigation,
  setDataChanged
}) => {
  const { story, tasks } = dataset;
  const progress =
    tasks.length === 0
      ? ""
      : `- ${Math.round(
          (tasks.reduce((acc, task) => (acc + task.complete ? 1 : 0), 0) /
            tasks.length) *
            100
        )}% `;

  const storyScreen = blessed.box({
    parent: screen,
    width: "100%",
    height: "100%"
  });
  const infoScreen = blessed.box({
    parent: storyScreen,
    ...theme.BOX_STYLING,
    top: 0,
    right: 0,
    width: "100%",
    height: "100%-1",
    label: {
      text: `[ ${story.story_type}:${
        story.estimate !== undefined ? ` ${story.estimate} points, ` : ""
      } ${story.current_state} - Info ${progress}]`,
      side: "center"
    }
  });
  const labels =
    story.labels.length > 0
      ? story.labels
          .map(label => `{#006000-bg}[ ${label.name} ]{/#006000-bg}`)
          .join(" ") + "\n\n"
      : "";

  const textScroll = blessed.box({
    parent: infoScreen,
    ...theme.TEXT_STYLING,
    top: 0,
    left: 0,
    width: "100%-8",
    height: "100%-6",
    scrollable: true,
    alwaysScroll: true,
    focussed: true,
    mouse: true,
    keys: true,
    vi: true
  });
  const info = blessed.text({
    parent: textScroll,
    keyable: false,
    tags: true,
    content:
      `{bold}${blessed.escape(story.name || "")}{/bold}\n\n` +
      labels +
      blessed.escape(story.description || ""),
    style: theme.TEXT_STYLING
  });
  const controlBar = blessed.box({
    parent: infoScreen,
    bottom: -2,
    left: -5,
    right: -5,
    height: 3,
    keyable: true,
    tags: false,
    content: "",
    ...theme.BOX_STYLING,
    padding: { top: 0, left: 3, right: 3, bottom: 0 }
  });
  const nextState = getNextState(story);

  const nextStateButton = blessed.button({
    parent: controlBar,
    bottom: 0,
    shrink: true,
    keyable: true,
    tags: false,
    mouse: true,
    keys: true,
    vi: true,
    content: ` ${nextState.label} `,
    style: nextState.style
  });
  nextStateButton.on("press", async () => {
    if (nextState.value) {
      await api.put(`/projects/${story.project_id}/stories/${story.id}`, {
        current_state: nextState.value
      });
    }
    setDataChanged();
  });

  const taskScreen = blessed.box({
    parent: storyScreen,
    ...theme.BOX_STYLING,
    top: 0,
    right: 0,
    width: "100%",
    height: "100%-1",
    label: {
      text: `[ ${story.story_type}:${
        story.estimate !== undefined ? ` ${story.estimate} points, ` : ""
      } ${story.current_state} - Tasks ${progress}]`,
      side: "center"
    }
  });
  const taskList = blessed.list({
    parent: taskScreen,
    top: 0,
    bottom: 7,
    style: theme.LIST_STYLING,
    focussed: true,
    mouse: true,
    keys: true,
    vi: true,
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    items: tasks
      .map(task => `[${task.complete ? "X" : " "}] ${task.description}`)
      .concat(" +  Add new task")
  });
  tasks.push({
    id: "new",
    description: "",
    complete: false
  });
  blessed.line({
    bottom: 6,
    left: -3,
    right: -3,
    parent: taskScreen,
    style: theme.TEXT_STYLING,
    height: 1,
    orientation: "horizontal"
  });
  const taskActions = blessed.form({
    parent: taskScreen,
    left: 0,
    bottom: 0,
    height: 5,
    keys: true,
    style: theme.TEXT_STYLING
  });
  const taskText = blessed.textarea({
    parent: taskActions,
    top: 0,
    left: 0,
    height: 3,
    keys: true,
    vi: true,
    mouse: true,
    inputOnFocus: true,
    style: {
      ...theme.TEXT_STYLING,
      focus: {
        ...theme.LIST_STYLING.selected
      }
    }
  });

  const taskCompleteButton = blessed.checkbox({
    parent: taskActions,
    bottom: 0,
    left: 0,
    height: 1,
    keyable: true,
    style: theme.TEXT_STYLING,
    name: "taskComplete",
    height: 1,
    tags: true,
    width: "shrink",
    content: "Finished"
  });
  const taskSaveButton = blessed.button({
    parent: taskActions,
    bottom: 0,
    keyable: true,
    left: 15,
    height: 1,
    name: "taskSave",
    style: theme.BUTTON_STYLING,
    shadow: true,
    height: 1,
    width: "shrink",
    padding: { left: 1, right: 1 },
    content: "Update task"
  });
  let activeTask = null;
  taskSaveButton.on("press", async () => {
    const taskContent = taskText.getValue();
    const completed = taskCompleteButton.checked;
    if (activeTask.id === "new") {
      await api.post(
        `/projects/${story.project_id}/stories/${story.id}/tasks`,
        {
          description: taskContent,
          complete: completed
        }
      );
    } else {
      await api.put(
        `/projects/${story.project_id}/stories/${story.id}/tasks/${
          activeTask.id
        }`,
        {
          description: taskContent,
          complete: completed
        }
      );
    }
    setDataChanged();
  });

  const setupTaskDetails = task => {
    activeTask = task;
    task.complete ? taskCompleteButton.check() : taskCompleteButton.uncheck();
    taskText.setValue(task.description);

    task.id === "new"
      ? taskSaveButton.setContent("Create task")
      : taskSaveButton.setContent("Update task");
  };
  if (tasks.length > navigation.selectedTask) {
    taskList.select(navigation.selectedTask);
    setupTaskDetails(tasks[navigation.selectedTask]);
  } else {
    taskCheckbox.hide();
    taskText.hide();
  }
  taskList.on("select item", (item, index) => {
    setupTaskDetails(tasks[index]);
    setNavigation({ selectedTask: index });
  });
  taskList.on("keypress", async char => {
    if (activeTask.id !== "new" && char === "x") {
      await api.put(
        `/projects/${story.project_id}/stories/${story.id}/tasks/${
          activeTask.id
        }`,
        {
          complete: !activeTask.complete
        }
      );
      setDataChanged();
    }
  });
  taskList.on("select", (item, index) => {
    taskText.focus();
  });

  const focusTab = tab => {
    tab === 0 ? infoScreen.show() : infoScreen.hide();
    tab === 2 ? taskScreen.show() : taskScreen.hide();

    tab === 0 && textScroll.focus();
    tab === 2 && taskList.focus();
    setNavigation({ activeTab: tab });
  };
  focusTab(navigation.activeTab);

  const bar = blessed.listbar({
    parent: storyScreen,
    autoCommandKeys: true,
    mouse: true,
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    commands: {
      Info: {
        keys: ["1"],
        callback: () => {
          focusTab(0);
        }
      },
      Comments: {
        keys: ["2"],
        callback: () => {
          focusTab(1);
        }
      },
      Tasks: {
        keys: ["3"],
        callback: () => {
          focusTab(2);
        }
      },
      Refresh: {
        keys: ["4"],
        callback: () => {
          setDataChanged();
        }
      },
      Quit: {
        keys: ["5"],
        callback: () => {
          process.exit(0);
        }
      }
    }
  });
  storyScreen.on("destroy", () => {
    bar.destroy();
    taskText.destroy();
  });
  return storyScreen;
};

const REFRESH_TIMEOUT = 120e3; // 120 seconds

const storyBranch = /^ref:\srefs\/heads\/.+?(\d{8,})/;
let changeResolver = null;
const setDataChanged = () => {
  setTimeout(changeResolver, 2);
};
const headFileOrDataChange = async () =>
  new Promise(resolve => {
    let timeout = null;
    const end = () => {
      clearTimeout(timeout);
      watcher.close();
      resolve(true);
    };
    const watcher = watch(".git/HEAD", end);
    changeResolver = () => end();
    timeout = setTimeout(end, REFRESH_TIMEOUT);
  });

const fetchStoryData = async (api, project, storyId) => {
  const storyUrl = `/projects/${project.project_id}/stories/${storyId}`;
  return {
    story: await api.get(storyUrl),
    tasks: await api.get(`${storyUrl}/tasks`)
  };
};

const updateLoop = async (project, api) => {
  let currentStoryId = false;
  let storyScreen;
  let navigation = { activeTab: 0, selectedTask: 0 };
  const setNavigation = navState =>
    (navigation = { ...navigation, ...navState });

  let dataset = {};

  while (true) {
    const gitHead = await fileOrExit(
      ".git/HEAD",
      "Please run this from the git root of your project"
    );
    const storyId = (gitHead.match(storyBranch) || [])[1];

    currentStoryId = storyId;
    if (storyId) {
      try {
        const storyDataset = await fetchStoryData(api, project, storyId);
        if (JSON.stringify(storyDataset) !== JSON.stringify(dataset)) {
          dataset = storyDataset;
          if (storyScreen) {
            storyScreen.destroy();
          }
          storyScreen = buildStoryUI({
            dataset,
            navigation,
            setNavigation,
            setDataChanged,
            api
          });
        }
      } catch (e) {
        if (storyScreen) {
          storyScreen.destroy();
        }
        dataset = {};
        storyScreen = buildNoStoryUI(
          theme,
          screen,
          `Story not found: {bold}${storyId}{/bold}\n\n${e.message}`
        );
      }
    } else {
      if (storyScreen) {
        storyScreen.destroy();
      }
      dataset = {};
      storyScreen = buildNoStoryUI(
        theme,
        screen,
        "Currently not on a story branch"
      );
    }
    screen.render();
    await headFileOrDataChange();
  }
};

const run = async () => {
  const gitHead = await fileOrExit(
    ".git/HEAD",
    "Please run this from the git root of your project"
  );
  const trackerData = await getOrAskTrackerToken(
    screen,
    theme,
    `${homedir}/.pt.json`
  );
  const apiToken = trackerData.apiKey;
  const api = createAPIFunctions(apiToken);

  const profile = await api.get("/me");
  const project = await chooseProject(
    screen,
    theme,
    ".pt.json",
    profile.projects
  );

  updateLoop(project, api);
};

run();
