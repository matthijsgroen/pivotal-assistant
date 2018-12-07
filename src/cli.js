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
const { getNextStoryState } = require("./lib/next-story-state");
const querystring = require("querystring");

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

const buildStoryUI = ({
  api,
  story,
  navigation,
  setNavigation,
  setDataChanged
}) => {
  const progress =
    story.tasks.length === 0
      ? ""
      : `- ${Math.round(
          (story.tasks.reduce((acc, task) => acc + (task.complete ? 1 : 0), 0) /
            story.tasks.length) *
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
  const nextState = getNextStoryState(story);

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

  const commentsScreen = blessed.box({
    parent: storyScreen,
    ...theme.BOX_STYLING,
    top: 0,
    right: 0,
    width: "100%",
    height: "100%-1",
    label: {
      text: `[ ${story.story_type}:${
        story.estimate !== undefined ? ` ${story.estimate} points, ` : ""
      } ${story.current_state} - Comments ${progress}]`,
      side: "center"
    }
  });
  const commentsLog = blessed.log({
    parent: commentsScreen,
    style: theme.TEXT_STYLING,
    tags: true,
    top: 0,
    bottom: 3
  });
  const chatBar = blessed.textbox({
    parent: commentsScreen,
    bottom: 0,
    height: 1,
    mouse: true,
    keys: true,
    vi: true
  });
  chatBar.on("submit", async () => {
    const message = chatBar.getValue();
    await api.post(
      `/projects/${story.project_id}/stories/${story.id}/comments`,
      { text: message }
    );
    setDataChanged();
  });
  let date = null;
  const dateStr = date =>
    `${date.getFullYear()}-${`00${date.getMonth() + 1}`.slice(
      -2
    )}-${`00${date.getDate()}`.slice(-2)}`;

  const timeStr = date =>
    `${`00${date.getHours()}`.slice(-2)}:${`00${date.getMinutes()}`.slice(-2)}`;

  const today = dateStr(new Date());
  const yesterday = dateStr(new Date(new Date() * 1 - 24 * 60 * 60 * 1000));
  const fileSize = size => {
    const scale = [
      { size: 1024 * 1024 * 1024, unit: "GB" },
      { size: 1024 * 1024, unit: "MB" },
      { size: 1024, unit: "KB" },
      { size: 0, unit: "B" }
    ].find(scale => size > scale.size);

    return `${Math.round((size / scale.size) * 10) / 10}${scale.unit}`;
  };

  story.comments.forEach(comment => {
    const localDate = new Date(comment.created_at);
    const messageDate = dateStr(localDate);
    const messageTime = timeStr(localDate);

    if (messageDate !== date) {
      date = messageDate;
      const displayDate =
        date === today
          ? "Today"
          : date === yesterday
            ? "Yesterday"
            : messageDate;
      commentsLog.add(`{center}- ${displayDate} -{/center}`);
    }

    comment.text &&
      commentsLog.add(
        `{black-fg}[${timeStr(localDate)}]{/black-fg} {bold}${
          comment.person.name
        }{/bold}: ${comment.text}`
      );
    comment.file_attachments.forEach(attachment =>
      commentsLog.add(
        `{black-fg}[${timeStr(localDate)}]{/black-fg} * {bold}${
          comment.person.name
        }{/bold} uploaded {underline}${
          attachment.filename
        }{/underline} {black-fg}(${fileSize(attachment.size)}){/black-fg}`
      )
    );
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
  const tasks = [
    ...story.tasks,
    {
      id: "new",
      description: "",
      complete: false
    }
  ];
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
      .slice(0, -1)
      .map(task => `[${task.complete ? "X" : " "}] ${task.description}`)
      .concat(" +  Add new task")
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
    taskCompleteButton.hide();
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
    tab === 1 ? commentsScreen.show() : commentsScreen.hide();
    tab === 2 ? taskScreen.show() : taskScreen.hide();

    tab === 0 && textScroll.focus();
    tab === 1 && chatBar.focus();
    tab === 2 && taskList.focus();
    setNavigation({ activeTab: tab });
  };
  focusTab(navigation.activeTab);

  const commentsKey = `Comments (${story.comments.length})`;
  const tasksKey = `Tasks (${story.tasks.length})`;

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
      [commentsKey]: {
        keys: ["2"],
        callback: () => {
          focusTab(1);
        }
      },
      [tasksKey]: {
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
    chatBar.destroy();
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

const fetchStory = async (api, project, storyId) => {
  const args =
    ":default,tasks,labels(name),comments(created_at,text,person,file_attachments)";
  const storyUrl = `/projects/${
    project.project_id
  }/stories/${storyId}?${querystring.stringify({ fields: args })}`;
  return await api.get(storyUrl);
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
        const story = await fetchStory(api, project, storyId);
        if (JSON.stringify(story) !== JSON.stringify(dataset)) {
          dataset = story;
          if (storyScreen) {
            storyScreen.destroy();
          }
          storyScreen = buildStoryUI({
            story,
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

const [major, minor, patch] = process.version
  .slice(1)
  .split(".")
  .map(e => parseInt(e, 10));
const nodeVersion = { major, minor, patch };
const supportedVersion = major > 10 || (major === 10 && minor >= 9);
if (!supportedVersion) {
  process.stdout.write(
    `Node version ${
      process.version
    } detected, minimal version required: 10.9.0\n`
  );
  process.exit(1);
}

run();
