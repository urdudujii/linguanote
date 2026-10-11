import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 你的 Firebase 网页配置
const firebaseConfig = {
  apiKey: "AIzaSyBggKvokARDEyUqRidc5Dl1ikcvTEXrr9w",
  authDomain: "linguanote-cbcf8.firebaseapp.com",
  projectId: "linguanote-cbcf8",
  storageBucket: "linguanote-cbcf8.firebasestorage.app",
  messagingSenderId: "91434139745",
  appId: "1:91434139745:web:d39d26bb6f26bd1f476a20"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const STORAGE_KEY = "linguanote-notes-v2";
const ACTIVE_KEY = "linguanote-active-v2";

const titleInput = document.getElementById("note-title");
const notesList = document.getElementById("notes-list");
const status = document.getElementById("status");
const authStatus = document.getElementById("auth-status");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("login-btn");
const registerButton = document.getElementById("register-btn");
const logoutButton = document.getElementById("logout-btn");

let notes = [];
let activeId = null;
let user = null;
let tool = "pen";
let drawing = false;
let lastX = 0;
let lastY = 0;
let history = [];
let cloudTimers = new Map();
let dataScope = "guest";
let loadingAccount = false;

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function notesKey() {
  return dataScope === "guest"
    ? STORAGE_KEY
    : STORAGE_KEY + "-" + dataScope;
}

function activeKey() {
  return dataScope === "guest"
    ? ACTIVE_KEY
    : ACTIVE_KEY + "-" + dataScope;
}

function persistNotes() {
  try {
    localStorage.setItem(notesKey(), JSON.stringify(notes));
    localStorage.setItem(activeKey(), activeId || "");
  } catch (error) {
    status.textContent = "本地保存失败，请导出重要笔记";
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
    ctx.save();
    ctx.setTransform(
      window.devicePixelRatio || 1, 0, 0,
      window.devicePixelRatio || 1, 0, 0
    );
    ctx.drawImage(image, 0, 0, width, height);
    ctx.restore();
  };
  image.onerror = () => {
    status.textContent = "图片读取失败，请检查笔记";
  };
  image.src = data;
}

function queueCloudSave(note) {
  if (!user || loadingAccount || !note) return;

  const noteCopy = {
    id: note.id,
    title: note.title || "",
    image: note.image || ""
  };

  clearTimeout(cloudTimers.get(note.id));

  const timer = setTimeout(async () => {
    try {
      await setDoc(
        doc(db, "users", user.uid, "notes", noteCopy.id),
        {
          title: noteCopy.title,
          image: noteCopy.image,
          updatedAt: serverTimestamp()
        }
      );
      status.textContent = "已保存并同步到云端";
    } catch (error) {
      console.error(error);
      status.textContent =
        "云端保存失败。请检查网络、登录状态及 Firebase 设置。";
    } finally {
      cloudTimers.delete(noteCopy.id);
    }
  }, 700);

  cloudTimers.set(note.id, timer);
}

function saveCurrentCanvas() {
  const note = currentNote();
  if (!note) return;

  try {
    note.image = canvas.toDataURL("image/png");
    persistNotes();
    queueCloudSave(note);
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

      persistNotes();
      titleInput.value = note.title || "";
      renderImage(note.image);
      renderNotesList();
      status.textContent = "已打开：" + (note.title || "未命名笔记");
    });

    notesList.appendChild(button);
  });
}

function loadLocalNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(notesKey()) || "[]");
    notes = Array.isArray(saved) ? saved : [];
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

  const savedActive = localStorage.getItem(activeKey());
  activeId = notes.some(note => note.id === savedActive)
    ? savedActive
    : notes[0].id;

  persistNotes();
  titleInput.value = currentNote()?.title || "";
  renderImage(currentNote()?.image || "");
  renderNotesList();
}

function saveSnapshot() {
  history.push(canvas.toDataURL("image/png"));
  if (history.length > 30) history.shift();
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
    .classList.toggle("primary", tool === "pen");
  document.getElementById("eraser")
    .classList.toggle("primary", tool === "eraser");
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
  ctx.arc(
    lastX, lastY,
    Number(document.getElementById("size").value) / 2,
    0, Math.PI * 2
  );
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
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
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
    queueCloudSave(note);
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
  queueCloudSave(note);
  status.textContent = "已创建新笔记";
});

titleInput.addEventListener("input", () => {
  const note = currentNote();
  if (!note) return;

  note.title = titleInput.value;
  persistNotes();
  renderNotesList();
  queueCloudSave(note);
});

document.getElementById("delete-note").addEventListener("click", async () => {
  const note = currentNote();
  if (!note) return;

  if (!confirm("确定删除笔记「" + note.title + "」？此操作无法撤销。")) {
    return;
  }

  clearTimeout(cloudTimers.get(note.id));
  cloudTimers.delete(note.id);

  if (user) {
    try {
      await deleteDoc(doc(db, "users", user.uid, "notes", note.id));
    } catch (error) {
      console.error(error);
      status.textContent = "云端删除失败，请检查网络后重试";
      return;
    }
  }

  notes = notes.filter(item => item.id !== note.id);

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

async function syncLocalNotesToCloud() {
  for (const note of notes) {
    await setDoc(
      doc(db, "users", user.uid, "notes", note.id),
      {
        title: note.title || "",
        image: note.image || "",
        updatedAt: serverTimestamp()
      }
    );
  }
}

async function loadCloudNotes(account) {
  loadingAccount = true;
  user = account;
  dataScope = account.uid;
  history = [];
  authStatus.textContent = "正在读取云端笔记……";

  try {
    const snapshot = await getDocs(
      collection(db, "users", account.uid, "notes")
    );

    if (user?.uid !== account.uid) return;

    if (snapshot.empty) {
      // 首次登录：允许将游客笔记复制到账号
      dataScope = "guest";
      loadLocalNotes();

      const hasLocalNotes = notes.length > 0;
      const migrate = hasLocalNotes && confirm(
        "云端还没有笔记。要把这台设备上的笔记复制到你的账号吗？"
      );

      dataScope = account.uid;

      if (migrate) {
        await syncLocalNotesToCloud();
      } else {
        notes = [];
      }
    } else {
      notes = snapshot.docs.map(item => ({
        id: item.id,
        title: item.data().title || "未命名笔记",
        image: item.data().image || ""
      }));
    }

    if (!notes.length) {
      notes = [{
        id: makeId(),
        title: "我的第一篇笔记",
        image: ""
      }];
      queueCloudSave(notes[0]);
    }

    const savedActive = localStorage.getItem(activeKey());
    activeId = notes.some(note => note.id === savedActive)
      ? savedActive
      : notes[0].id;

    persistNotes();
    titleInput.value = currentNote()?.title || "";
    renderImage(currentNote()?.image || "");
    renderNotesList();

    authStatus.textContent = "已登录：" + account.email + "（云端同步已启用）";
    status.textContent = "云端笔记已加载";
  } catch (error) {
    console.error(error);
    authStatus.textContent = "读取云端失败，请检查网络和 Firebase 设置";
    status.textContent = "云端加载失败：" + error.message;
  } finally {
    loadingAccount = false;
  }
}

document.getElementById("auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  loginButton.disabled = true;
  registerButton.disabled = true;
  authStatus.textContent = "正在登录……";

  try {
    await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value
    );
  } catch (error) {
    console.error(error);
    authStatus.textContent = "登录失败：" + friendlyAuthError(error);
  } finally {
    loginButton.disabled = false;
    registerButton.disabled = false;
  }
});

registerButton.addEventListener("click", async () => {
  if (!emailInput.value.trim() || !passwordInput.value) {
    authStatus.textContent = "请先填写邮箱和密码";
    return;
  }

  loginButton.disabled = true;
  registerButton.disabled = true;
  authStatus.textContent = "正在注册……";

  try {
    await createUserWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value
    );
  } catch (error) {
    console.error(error);
    authStatus.textContent = "注册失败：" + friendlyAuthError(error);
  } finally {
    loginButton.disabled = false;
    registerButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    authStatus.textContent = "退出失败：" + friendlyAuthError(error);
  }
});

function friendlyAuthError(error) {
  const messages = {
    "auth/email-already-in-use": "这个邮箱已经注册，请直接登录。",
    "auth/invalid-email": "邮箱格式不正确。",
    "auth/weak-password": "密码太简单，请使用至少 6 位。",
    "auth/invalid-credential": "邮箱或密码错误，请检查后重试。",
    "auth/user-not-found": "没有找到这个账号，请先注册。",
    "auth/wrong-password": "密码不正确。",
    "auth/too-many-requests": "尝试次数太多，请稍后再试。",
    "auth/unauthorized-domain": "当前网站域名尚未加入 Firebase 授权域名。"
  };

  return messages[error.code] || error.message || "请稍后重试。";
}

onAuthStateChanged(auth, async account => {
  if (account) {
    logoutButton.hidden = false;
    await loadCloudNotes(account);
  } else {
    user = null;
    dataScope = "guest";
    logoutButton.hidden = true;
    authStatus.textContent = "尚未登录，笔记仅保存在当前设备。";
    loadLocalNotes();
  }
});

loadLocalNotes();
resizeCanvas();
renderNotesList();

window.addEventListener("resize", () => {
  saveCurrentCanvas();
  resizeCanvas();
});
