// This is a Pi extension: it shows the user HTML in a popup of Dolly's page
// through the html command (html@0), which the page builds from the
// document's text, tables and forms in its own style. ask_user asks
// questions in a form and returns the answers; show_html shows a report, or
// a form of the model's own.
import { spawn } from "node:child_process";

// Resolves to the submitted form's fields, or null when the user closed the popup.
function showHtml(document, signal) {
  return new Promise((resolveFields, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const child = spawn("html", [], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stdout.on("data", (bytes) => { output += bytes; });
    child.stderr.on("data", (bytes) => { errors += bytes; });
    const kill = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", kill);
    child.on("error", reject);
    child.on("close", (status) => {
      signal?.removeEventListener("abort", kill);
      if (signal?.aborted) reject(new Error("aborted"));
      else if (status === 0) resolveFields(new URLSearchParams(output.trim()));
      else if (status === 1) resolveFields(null);
      else reject(new Error(errors.trim() || `html exited with status ${status}`));
    });
    child.stdin.end(document);
  });
}

const escape = (text) => String(text).replace(/[&<>"]/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);

// One fieldset a question: a text area, or its choices as radio buttons
// (checkboxes when several may be chosen).
function questionForm(title, questions) {
  const fields = questions.map(({ question, choices, multiple }, index) => {
    const name = `q${index}`;
    const answers = choices?.length
      ? choices.map((choice) => `<label><input type="${multiple ? "checkbox" : "radio"}" name="${name}" ` +
        `value="${escape(choice)}"${multiple ? "" : " required"}> ${escape(choice)}</label><br>`).join("")
      : `<textarea name="${name}" rows="3" required></textarea>`;
    return `<fieldset><legend>${escape(question)}</legend>${answers}</fieldset>`;
  }).join("");
  return `<h1>${escape(title)}</h1><form>${fields}<button>Send answers</button></form>`;
}

const textResult = (text, details) => ({ content: [{ type: "text", text }], details });

export default function askUser(pi) {
  pi.registerTool({
    name: "ask_user",
    label: "ask user",
    executionMode: "sequential",
    // Pi's advice for a tool that asks the user: the model calls it, no script does.
    exposure: "model-only",
    description:
      "Ask the user one or more questions in a form shown over the terminal, and wait for the answers. " +
      "Use it when a decision or a fact only the user has is needed to go on, not for anything you can find " +
      "out yourself. A question with choices is answered by choosing one (or several, with multiple); one " +
      "without choices by typing. Returns each question's answer, or that the user closed the form.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "The form's heading: what the questions are about" },
        questions: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              choices: { type: "array", items: { type: "string" }, description: "Answers to choose from" },
              multiple: { type: "boolean", description: "Whether several choices may be chosen" },
            },
            required: ["question"],
            additionalProperties: false,
          },
        },
      },
      required: ["title", "questions"],
      additionalProperties: false,
    },
    async execute(_id, { title, questions }, signal) {
      const fields = await showHtml(questionForm(title, questions), signal);
      if (!fields) return textResult("The user closed the form without answering.", { answered: false });
      const answers = questions.map(({ question, multiple }, index) => ({ question,
        answer: multiple ? fields.getAll(`q${index}`) : fields.get(`q${index}`) ?? "" }));
      return textResult(JSON.stringify(answers), { answered: true, answers });
    },
  });

  pi.registerTool({
    name: "show_html",
    label: "show HTML",
    executionMode: "sequential",
    exposure: "model-only",
    description:
      "Show the user an HTML document in a popup over the terminal, such as a report, and wait until they " +
      "close it. Write content: headings, paragraphs, lists, tables, pre and code, details, and forms with " +
      "inputs, selects, textareas and buttons. The page styles it; style, classes, scripts, images, links and " +
      "SVG are left out. If the user submits a form of it, returns the form's fields.",
    parameters: {
      type: "object",
      properties: { html: { type: "string", description: "The document, at most 1 MiB" } },
      required: ["html"],
      additionalProperties: false,
    },
    async execute(_id, { html }, signal) {
      const fields = await showHtml(html, signal);
      if (!fields) return textResult("The user read the document and closed it.", { submitted: false });
      return textResult(JSON.stringify([...fields]), { submitted: true, fields: [...fields] });
    },
  });
}
