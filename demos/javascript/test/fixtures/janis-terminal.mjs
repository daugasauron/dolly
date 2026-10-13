// The terminal answers eighteen colour questions with more than 256 bytes.
// Every 'data' event must end where an answer ends: Pi takes what follows an
// unfinished answer for typed text.
const questions = ["\x1b]10;?\x1b\\", "\x1b]11;?\x1b\\",
  ...Array.from({ length: 16 }, (_, index) => `\x1b]4;${index};?\x1b\\`)];
const finish = status => { process.stdin.setRawMode(false); process.exit(status); };
let answers = "";
process.stdin.setRawMode(true);
process.stdin.on("data", chunk => {
  const text = chunk.toString("latin1");
  if (!/(\x1b\\|\x07)$/.test(text)) finish(1);
  answers += text;
  if (answers.split("rgb:").length - 1 === questions.length) finish(answers.length > 256 ? 0 : 3);
});
setTimeout(() => finish(2), 5000);
process.stdout.write(questions.join(""));
