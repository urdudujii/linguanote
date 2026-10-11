const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const STORAGE_KEY = "linguanote-notes-v2";
const ACTIVE_KEY = "linguanote-active-v2";

const titleInput = document.getElementById("note-title");
const notesList = document.getElementById("notes-list");
const status = document.getElementById("status");

let notes = [];
let activeId = null;
let tool = "pen";
let drawing = false;
let lastX = 0;
let lastY = 0;
let history = [];

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved)) notes = saved;
  } catch {
    notes = [];
  }

  if (!notes.length) {
    notes = [{
      id: makeId(),
      title: "我的第一篇笔记",
      image: ""
    }];
  }

  const savedActive = localStorage.getItem(ACTIVE_KEY);
  activeId = notes.some(note => note.id === savedActive)
    ? savedActive
    : notes[0].id;

  persistNotes();
}

function persistNotes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    localStorage.setItem(ACTIVE_KEY, activeId || "");
    status.textContent = "已自动保存";
  } catch (error) {
    status.textContent = "保存失败：浏览器存储空间可能不足，请先导出重要笔记";
    console.error(error);
  }
}

function currentNote() {
  return notes.find(note => note.id === activeId);
}

function getSize() {
  return {
    width: canvas.clientWidth,
    height: canvas.clientHeight
  };
}

function fillWhite() {
  const { width, height } = getSize();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function renderImage(data) {
  fillWhite();

  if (!data) return;

  const image = new Image();
  image.onload = () => {
    const { width, height } = getSize();
    ctx.drawImage(image, 0, 0, width, height);
  };
  image.src = data;
}

function saveCurrentCanvas() {
  const note = currentNote();
  if (!note) return;

  try {
    note.image = canvas.toDataURL("image/png");
    persistNotes();
  } catch (error) {
    status.textContent = "保存失败，请导出重要笔记";
    console.error(error);
  }
}

function resizeCanvas() {
  const note = currentNote();
  const previousImage = note?.image || "";
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  renderImage(previousImage);
}

function renderNotesList() {
  notesList.replaceChildren();

  notes.forEach(note => {
    const button = document.createElement("button");
    button.className = "note-item" +
      (note.id === activeId ? " active" : "");
    button.textContent = note.title || "未命名笔记";
    button.title = note.title || "未命名笔记";

    button.addEventListener("click", () => {
      if (note.id === activeId) return;

      saveCurrentCanvas();
      activeId = note.id;
      history = [];

      localStorage.setItem(ACTIVE_KEY, activeId);
      titleInput.value = note.title;
      renderImage(note.image);
      renderNotesList();
      status.textContent = "已打开：" + note.title;
    });

    notesList.appendChild(button);
  });
}

function saveSnapshot() {
  history.push(canvas.toDataURL("image/png"));

  if (history.length > 30) {
    history.shift();
  }
}

function getPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function selectTool(nextTool) {
  tool = nextTool;
  document.getElementById("pen")
    .classList.toggle("active", tool === "pen");
  document.getElementById("eraser")
    .classList.toggle("active", tool === "eraser");
}

document.getElementById("pen").addEventListener("click", () => {
  selectTool("pen");
});

document.getElementById("eraser").addEventListener("click", () => {
  selectTool("eraser");
});

canvas.addEventListener("pointerdown", event => {
  event.preventDefault();

  if (event.pointerType === "mouse" && event.button !== 0) return;

  canvas.setPointerCapture(event.pointerId);
  saveSnapshot();

  drawing = true;
  const point = getPoint(event);
  lastX = point.x;
  lastY = point.y;

  ctx.beginPath();
  ctx.arc(lastX, lastY, Number(document.getElementById("size").value) / 2, 0, Math.PI * 2);
  ctx.fillStyle = tool === "eraser"
    ? "#ffffff"
    : document.getElementById("color").value;
  ctx.fill();
});

canvas.addEventListener("pointermove", event => {
  if (!drawing) return;
  event.preventDefault();

  const point = getPoint(event);
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(point.x, point.y);
  ctx.lineWidth = Number(document.getElementById("size").value);
  ctx.strokeStyle = tool === "eraser"
    ? "#ffffff"
    : document.getElementById("color").value;
  ctx.stroke();

  lastX = point.x;
  lastY = point.y;
});

function stopDrawing() {
  if (!drawing) return;
  drawing = false;
  saveCurrentCanvas();
}

canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);
canvas.addEventListener("lostpointercapture", stopDrawing);

document.getElementById("undo").addEventListener("click", () => {
  if (!history.length) return;

  const previous = history.pop();
  renderImage(previous);

  const note = currentNote();
  if (note) {
    note.image = previous;
    persistNotes();
  }
});

document.getElementById("clear").addEventListener("click", () => {
  saveSnapshot();
  fillWhite();
  saveCurrentCanvas();
});

document.getElementById("save").addEventListener("click", () => {
  const link = document.createElement("a");
  const safeTitle = (currentNote()?.title || "LinguaNote")
    .replace(/[\\/:*?"<>|]/g, "_");

  link.download = safeTitle + ".png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

document.getElementById("new-note").addEventListener("click", () => {
  saveCurrentCanvas();

  const note = {
    id: makeId(),
    title: "新笔记 " + (notes.length + 1),
    image: ""
  };

  notes.unshift(note);
  activeId = note.id;
  history = [];

  persistNotes();
  titleInput.value = note.title;
  renderNotesList();
  fillWhite();
  status.textContent = "已创建新笔记";
});

titleInput.addEventListener("input", () => {
  const note = currentNote();
  if (!note) return;

  note.title = titleInput.value;
  persistNotes();
  renderNotesList();
});

document.getElementById("delete-note").addEventListener("click", () => {
  const note = currentNote();
  if (!note) return;

  if (!confirm("确定删除笔记「" + note.title + "」？此操作无法撤销。")) {
    return;
  }

  notes = notes.filter(item => item.id !== activeId);

  if (!notes.length) {
    notes.push({
      id: makeId(),
      title: "我的第一篇笔记",
      image: ""
    });
  }

  activeId = notes[0].id;
  history = [];

  persistNotes();
  titleInput.value = notes[0].title;
  renderNotesList();
  renderImage(notes[0].image);
  status.textContent = "笔记已删除";
});

loadNotes();
resizeCanvas();
titleInput.value = currentNote()?.title || "";
renderNotesList();

window.addEventListener("resize", () => {
  saveCurrentCanvas();
  resizeCanvas();
});