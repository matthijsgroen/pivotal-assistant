const blessed = require("blessed");
const util = require("util");
const { watch } = require("fs");
const readFile = util.promisify(require("fs").readFile);
const writeFile = util.promisify(require("fs").writeFile);
const homedir = require("os").homedir();
const theme = require("./themes/pivotal");
const { createAPIFunctions } = require("./api");

const screen = blessed.screen({
  smartCSR: true
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

const getOrAskTrackerToken = async path => {
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

const chooseProject = async (path, projects) => {
  try {
    const projectId = JSON.parse(await readFile(path, "utf8")).pivotalProject;
    const project = projects.find(project => project.project_id === projectId);
    if (project) {
      return project;
    } else {
      throw Error("project not found");
    }
  } catch (e) {
    new Promise(resolve => {
      const form = blessed.form({
        ...theme.BOX_STYLING,
        top: "center",
        left: "center",
        keys: true,
        height: projects.length + 9
      });
      blessed.text({
        parent: form,
        keyable: false,
        content: "Choose your project for this repo",
        style: theme.TEXT_STYLING
      });
      const radioset = blessed.radioset({
        parent: form,
        top: 3,
        height: projects.length,
        style: theme.TEXT_STYLING
      });
      let selectedProject = null;
      projects.forEach((project, index) => {
        const radioButton = blessed.radiobutton({
          parent: radioset,
          top: index,
          content: project.project_name,
          name: "project",
          mouse: true,
          style: theme.TEXT_STYLING
        });
        radioButton.on("check", () => (selectedProject = project));
      });
      const submit = blessed.button({
        parent: form,
        content: "Submit",
        top: 4 + projects.length,
        shadow: true,
        height: 1,
        width: "shrink",
        padding: { left: 1, right: 1 },
        left: "center",
        mouse: true,
        keys: true,
        name: "submit",
        style: theme.BUTTON_STYLING
      });
      submit.on("press", () => selectedProject && form.submit());

      form.on("submit", async data => {
        form.destroy();
        screen.render();
        await writeFile(
          path,
          JSON.stringify({ pivotalProject: selectedProject.project_id }),
          "utf8"
        );
        resolve(selectedProject);
      });
      form.focus();
      screen.append(form);
      screen.render();
    });
  }
};

const buildStoryUI = (story, tasks) => {
  const storyScreen = blessed.box({
    parent: screen,
    width: "100%",
    height: "100%"
  });
  const textArea = blessed.box({
    parent: storyScreen,
    ...theme.BOX_STYLING,
    top: 0,
    right: 0,
    width: "100%",
    height: "100%-1",
    scrollable: true,
    alwaysScroll: true,
    focussed: true,
    mouse: true,
    keys: true,
    vi: true,
    label: {
      text: `[ ${story.story_type}:${
        story.estimate !== undefined ? ` ${story.estimate} points, ` : ""
      } ${story.current_state} - Info ]`,
      side: "center"
    }
  });
  const info = blessed.text({
    parent: textArea,
    keyable: false,
    tags: true,
    content:
      `{bold}${blessed.escape(story.name)}{/bold}\n\n` +
      blessed.escape(story.description),
    style: theme.TEXT_STYLING
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
      } ${story.current_state} - Tasks ]`,
      side: "center"
    }
  });
  const taskList = blessed.list({
    parent: taskScreen,
    top: 0,
    bottom: 11,
    style: theme.LIST_STYLING,
    focussed: true,
    mouse: true,
    keys: true,
    vi: true,
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    items: tasks.map(
      task => `[${task.complete ? "X" : " "}] ${task.description}`
    )
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

  const taskCompleteButton = blessed.button({
    parent: taskActions,
    bottom: 0,
    left: 0,
    height: 1,
    style: theme.BUTTON_STYLING,
    name: "taskComplete",
    shadow: true,
    height: 1,
    tags: true,
    width: "shrink",
    padding: { left: 1, right: 1 },
    content: "Finish task"
  });

  const taskSaveButton = blessed.button({
    parent: taskActions,
    bottom: 0,
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

  const setupTaskDetails = task => {
    taskCompleteButton.setContent(task.complete ? "Open task" : "Finish task");
    taskText.setValue(task.description);
  };
  if (tasks.length > 0) {
    setupTaskDetails(tasks[0]);
  } else {
    taskCheckbox.hide();
    taskText.hide();
  }
  taskList.on("select item", (item, index) => {
    setupTaskDetails(tasks[index]);
  });
  taskList.on("select", (item, index) => {
    taskCompleteButton.focus();
  });

  taskScreen.hide();

  const bar = blessed.listbar({
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
          textArea.show();
          taskScreen.hide();
          textArea.focus();
        }
      },
      Comments: {
        keys: ["2"],
        callback: () => {
          textArea.hide();
          taskScreen.hide();
        }
      },
      Tasks: {
        keys: ["3"],
        callback: () => {
          textArea.hide();
          taskScreen.show();
          taskList.focus();
        }
      },
      Refresh: {
        keys: ["4"],
        callback: () => {}
      },
      Quit: {
        keys: ["5"],
        callback: () => {
          process.exit(0);
        }
      }
    }
  });
  storyScreen.append(bar);
  return storyScreen;
};

const buildNoStoryUI = message => {
  const storyScreen = blessed.box({
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

const REFRESH_TIMEOUT = 20e3; // 20 seconds

const storyBranch = /^ref:\srefs\/heads\/.+?(\d{8,})/;
const headFileChange = async () =>
  new Promise(resolve => {
    const watcher = watch(".git/HEAD", () => {
      watcher.close();
      resolve(true);
    });
  });

const updateLoop = async (project, api) => {
  let currentStoryId = false;
  let storyScreen;

  while (true) {
    const gitHead = await fileOrExit(
      ".git/HEAD",
      "Please run this from the git root of your project"
    );
    const storyId = (gitHead.match(storyBranch) || [])[1];

    if (storyId !== currentStoryId) {
      if (storyScreen) {
        storyScreen.destroy();
        screen.remove(storyScreen);
      }
      currentStoryId = storyId;
      if (storyId) {
        try {
          const storyUrl = `/projects/${project.project_id}/stories/${storyId}`;
          const story = await api.get(storyUrl);
          const storyTasks = await api.get(
            `/projects/${project.project_id}/stories/${storyId}/tasks`
          );
          storyScreen = buildStoryUI(story, storyTasks);
        } catch (e) {
          //storyScreen = buildNoStoryUI(
          //`Story not found: {bold}${storyId}{/bold}`
          //);
          throw e;
        }
      } else {
        storyScreen = buildNoStoryUI("Currently not on a story branch");
      }
      screen.render();
    }
    await headFileChange();
  }
};

const run = async () => {
  const gitHead = await fileOrExit(
    ".git/HEAD",
    "Please run this from the git root of your project"
  );
  const trackerData = await getOrAskTrackerToken(`${homedir}/.pt.json`);
  const apiToken = trackerData.apiKey;
  const api = createAPIFunctions(apiToken);

  const profile = await api.get("/me");
  const project = await chooseProject(".pt.json", profile.projects);

  updateLoop(project, api);
};

run();
