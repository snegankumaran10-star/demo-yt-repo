/* -----------------------------------------------------------------
   Shipped Resume Parser — client-side scoring
   No build step, no server. pdf.js reads the PDF's text layer locally,
   then a skill catalog is matched against that text.
   ----------------------------------------------------------------- */

(() => {
  "use strict";

  /* ---------------------------------------------------------------
     The role we score against. Every skill has an id, the label shown
     in the UI, and the patterns that count as evidence for it.
     Patterns are matched against lowercased resume text, so they are
     written lowercase; \b keeps "html" from matching "htmlencode".
     --------------------------------------------------------------- */
  const ROLE = "Frontend Engineer";

  const SKILLS = [
    { id: "html",          label: "HTML",              patterns: [/\bhtml5?\b/, /semantic markup/] },
    { id: "css",           label: "CSS",               patterns: [/\bcss3?\b/, /flexbox/, /css grid/, /sass|scss|less\b/] },
    { id: "javascript",    label: "JavaScript",        patterns: [/\bjavascript\b/, /\bes6\b/, /\bjs\b/] },
    { id: "typescript",    label: "TypeScript",        patterns: [/\btypescript\b/, /\bts\b/] },
    { id: "react",         label: "React",             patterns: [/\breact(\.js)?\b/, /react hooks/, /\bjsx\b/] },
    { id: "nextjs",        label: "Next.js",           patterns: [/next\.?js/, /\bnextjs\b/] },
    { id: "vue",           label: "Vue",               patterns: [/\bvue(\.js)?\b/, /\bnuxt\b/] },
    { id: "state",         label: "State management",  patterns: [/\bredux\b/, /\bzustand\b/, /\brecoil\b/, /react query|tanstack/, /\bcontext api\b/] },
    { id: "rest",          label: "REST APIs",         patterns: [/\brest(ful)?\b/, /\bhttp api/, /\bapis?\b/] },
    { id: "graphql",       label: "GraphQL",           patterns: [/\bgraphql\b/, /\bapollo\b/] },
    { id: "responsive",    label: "Responsive design", patterns: [/responsive/, /mobile[- ]first/, /media queries/, /breakpoint/] },
    { id: "a11y",          label: "Accessibility",     patterns: [/accessib/, /\ba11y\b/, /\bwcag\b/, /\baria\b/, /screen reader/] },
    { id: "testing",       label: "Testing",           patterns: [/\bjest\b/, /\bvitest\b/, /\bplaywright\b/, /\bcypress\b/, /react testing library/, /unit test/] },
    { id: "git",           label: "Git",               patterns: [/\bgit(hub|lab)?\b/, /version control/, /pull request/] },
    { id: "build",         label: "Build tooling",     patterns: [/\bwebpack\b/, /\bvite\b/, /\brollup\b/, /\besbuild\b/, /bundl/] },
    { id: "perf",          label: "Web performance",   patterns: [/performance/, /lighthouse/, /core web vitals/, /lazy load/, /code splitt/] },
    { id: "node",          label: "Node.js",           patterns: [/node\.?js/, /\bnpm\b/, /\bexpress\b/] },
    { id: "cicd",          label: "CI/CD",             patterns: [/\bci\/cd\b/, /continuous integration/, /github actions/, /\bpipeline/] },
    { id: "docker",        label: "Docker",            patterns: [/\bdocker\b/, /container/] },
    { id: "figma",         label: "Design handoff",    patterns: [/\bfigma\b/, /design system/, /component library/, /storybook/] },
  ];

  /* A short resume used by "Try a sample result". It goes through the
     exact same matcher as a real upload, so the score you see is
     computed, not hard-coded. */
  const SAMPLE_TEXT = `
    Priya Raman — Frontend Engineer
    priya.raman@example.com · github.com/priyaraman

    Experience
    Frontend Developer, Northwind Labs (2022 - present)
    - Built a customer dashboard in React and TypeScript with React Hooks,
      replacing a jQuery admin panel and cutting load time by 40%.
    - Styled components with CSS Grid and Flexbox, using SCSS and a shared
      design system in Storybook.
    - Consumed REST APIs, added Redux for cross-page state, and wrote unit
      tests with Jest and React Testing Library.
    - Improved Core Web Vitals through lazy loading and code splitting.
    - Worked in a Git branching workflow with pull requests and peer review.

    Junior Web Developer, Cobalt Studio (2020 - 2022)
    - Handled responsive, mobile-first layouts against Figma designs.
    - Automated deploys with GitHub Actions and a small Node.js build script.

    Skills
    HTML5, CSS3, JavaScript (ES6), TypeScript, React, Redux, SCSS,
    REST APIs, Git, Jest, Node.js, Web Performance
  `;

  /* ---------------------------- element handles ---------------------------- */

  const els = {
    form:       document.getElementById("upload-form"),
    input:      document.getElementById("file-input"),
    dropzone:   document.getElementById("dropzone"),
    hint:       document.getElementById("dropzone-hint"),
    sampleBtn:  document.getElementById("sample-btn"),
    results:    document.getElementById("results"),
    ring:       document.getElementById("score-ring"),
    ringValue:  document.getElementById("ring-value"),
    scoreNum:   document.getElementById("score-number"),
    grade:      document.getElementById("grade"),
    summary:    document.getElementById("summary"),
    source:     document.getElementById("result-source"),
    modeNote:   document.getElementById("mode-note"),
    present:    document.getElementById("present-list"),
    missing:    document.getElementById("missing-list"),
    presentN:   document.getElementById("present-count"),
    missingN:   document.getElementById("missing-count"),
    againBtn:   document.getElementById("again-btn"),
  };

  const DEFAULT_HINT = els.hint.textContent;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r="52" in the SVG
  const MAX_BYTES = 10 * 1024 * 1024;

  /* ---------------------------- pdf.js setup ---------------------------- */

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  /* ---------------------------- text extraction ---------------------------- */

  /* Pull every page's text items out and join them. pdf.js returns text
     as positioned fragments, so the join adds spaces rather than newlines. */
  async function extractText(file) {
    if (!window.pdfjsLib) {
      throw new Error(
        "The PDF reader could not load — check your connection, or use the sample result."
      );
    }

    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];

    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(" "));
    }

    return pages.join("\n");
  }

  /* ---------------------------- matching ---------------------------- */

  function matchSkills(text) {
    const haystack = text.toLowerCase().replace(/\s+/g, " ");

    const present = [];
    const missing = [];

    for (const skill of SKILLS) {
      const found = skill.patterns.some((re) => re.test(haystack));
      (found ? present : missing).push(skill.label);
    }

    return { present, missing };
  }

  function scoreFor(presentCount) {
    return Math.round((presentCount / SKILLS.length) * 100);
  }

  function gradeFor(score) {
    if (score >= 80) return { title: "Strong match", tone: "strong" };
    if (score >= 55) return { title: "Good match, some gaps", tone: "mid" };
    if (score >= 30) return { title: "Partial match", tone: "low" };
    return { title: "Weak match", tone: "weak" };
  }

  /* ---------------------------- rendering ---------------------------- */

  function renderChips(listEl, labels, emptyMessage) {
    listEl.textContent = "";

    if (labels.length === 0) {
      const li = document.createElement("li");
      li.className = "chip empty";
      li.textContent = emptyMessage;
      listEl.appendChild(li);
      return;
    }

    labels.forEach((label, i) => {
      const li = document.createElement("li");
      li.className = "chip";
      li.textContent = label;
      li.style.animationDelay = `${Math.min(i * 35, 500)}ms`;
      listEl.appendChild(li);
    });
  }

  /* Count the number up and sweep the ring, unless reduced motion is set. */
  function animateScore(score, tone) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    els.ring.classList.remove("is-strong", "is-mid", "is-low", "is-weak");
    els.ring.classList.add(`is-${tone}`);

    const target = RING_CIRCUMFERENCE * (1 - score / 100);

    if (reduced) {
      els.ringValue.style.strokeDashoffset = target;
      els.scoreNum.textContent = String(score);
      return;
    }

    let start = null;
    const DURATION = 900;

    const step = (timestamp) => {
      if (start === null) start = timestamp;
      const t = Math.min((timestamp - start) / DURATION, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

      els.ringValue.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - eased * (score / 100));
      els.scoreNum.textContent = String(Math.round(eased * score));

      if (t < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }

  function renderResult({ text, sourceLabel, note }) {
    const { present, missing } = matchSkills(text);
    const score = scoreFor(present.length);
    const { title, tone } = gradeFor(score);

    els.source.textContent = sourceLabel;
    els.grade.textContent = title;
    els.summary.textContent =
      `Found ${present.length} of ${SKILLS.length} skills we look for in a ${ROLE} resume.`;

    if (note) {
      els.modeNote.textContent = note;
      els.modeNote.hidden = false;
    } else {
      els.modeNote.hidden = true;
      els.modeNote.textContent = "";
    }

    renderChips(els.present, present, "No matching skills found");
    renderChips(els.missing, missing, "Nothing missing — full coverage");

    els.presentN.textContent = String(present.length);
    els.missingN.textContent = String(missing.length);

    els.results.hidden = false;
    animateScore(score, tone);
    els.results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------------------------- upload flow ---------------------------- */

  function setHint(message, isError = false) {
    els.hint.textContent = message;
    els.hint.classList.toggle("is-error", isError);
  }

  async function handleFile(file) {
    if (!file) return;

    const looksLikePdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);

    if (!looksLikePdf) {
      setHint("That file is not a PDF — please choose a .pdf resume.", true);
      return;
    }

    if (file.size > MAX_BYTES) {
      setHint("That PDF is over 10 MB — try a smaller file.", true);
      return;
    }

    els.dropzone.classList.add("is-busy");
    setHint(`Reading ${file.name}…`);

    try {
      const text = await extractText(file);

      // A scanned PDF is images only: no text layer means nothing to match
      // against, and a score of 0 would be misleading rather than wrong.
      if (text.replace(/[^a-z0-9]/gi, "").length < 120) {
        setHint(
          "No text layer in that PDF — it looks like a scan. Try a text-based PDF, or use the sample.",
          true
        );
        return;
      }

      renderResult({ text, sourceLabel: file.name, note: null });
      setHint(DEFAULT_HINT);
    } catch (err) {
      setHint(err.message || "Could not read that PDF — try another file.", true);
    } finally {
      els.dropzone.classList.remove("is-busy");
    }
  }

  /* ---------------------------- events ---------------------------- */

  els.input.addEventListener("change", (event) => {
    handleFile(event.target.files[0]);
    event.target.value = ""; // so re-picking the same file fires again
  });

  ["dragenter", "dragover"].forEach((type) => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove("is-dragging");
    });
  });

  els.dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    handleFile(file);
  });

  els.sampleBtn.addEventListener("click", () => {
    renderResult({
      text: SAMPLE_TEXT,
      sourceLabel: "Sample resume",
      note: "This is a built-in sample resume, scored by the same matcher as an upload.",
    });
  });

  els.againBtn.addEventListener("click", () => {
    els.results.hidden = true;
    setHint(DEFAULT_HINT);
    els.input.focus();
    document.getElementById("upload").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  els.form.addEventListener("submit", (event) => event.preventDefault());
})();
