const blessed = require("blessed");
const util = require("util");
const readFile = util.promisify(require("fs").readFile);
const writeFile = util.promisify(require("fs").writeFile);

const chooseProject = async (parent, theme, path, projects) => {
  try {
    const projectId = JSON.parse(await readFile(path, "utf8")).pivotalProject;
    const project = projects.find(project => project.project_id === projectId);
    if (project) {
      return project;
    } else {
      throw Error("project not found");
    }
  } catch (e) {
    return new Promise(resolve => {
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
        parent.render();
        await writeFile(
          path,
          JSON.stringify({ pivotalProject: selectedProject.project_id }),
          "utf8"
        );
        resolve(selectedProject);
      });
      form.focus();
      parent.append(form);
      parent.render();
    });
  }
};

module.exports = {
  chooseProject
};
