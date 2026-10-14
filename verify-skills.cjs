/* Temporary check: pull SKILLS and SAMPLE_TEXT out of app.js and report
   which skills the matcher finds. Deleted once it has been run. */
const fs = require("fs");
const src = fs.readFileSync("app.js", "utf8");

const arrText = src.match(/const SKILLS = (\[[\s\S]*?\n {2}\];)/)[1];
const SKILLS = eval(arrText);

const bt = String.fromCharCode(96);
const start = src.indexOf("const SAMPLE_TEXT");
const text = src.slice(src.indexOf(bt, start) + 1, src.indexOf(bt, src.indexOf(bt, start) + 1));

const haystack = text.toLowerCase().replace(/\s+/g, " ");
const present = SKILLS.filter((s) => s.patterns.some((re) => re.test(haystack)));
const missing = SKILLS.filter((s) => !present.includes(s));

console.log(`score: ${Math.round((present.length / SKILLS.length) * 100)}/100  (${present.length} of ${SKILLS.length})`);
console.log(`present: ${present.map((s) => s.label).join(", ")}`);
console.log(`missing: ${missing.map((s) => s.label).join(", ")}`);
