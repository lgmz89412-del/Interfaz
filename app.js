import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 1) PEGA AQUÍ TU CONFIGURACIÓN (Firebase Console > Configuración del proyecto > Tus apps > Web)
const firebaseConfig = {
  apiKey: "AIzaSyAfFUEb_6UXpE_gjvtm9qUuKCKf0vXSQKU",
  authDomain: "interfaz-6f87f.firebaseapp.com",
  projectId: "interfaz-6f87f",
  storageBucket: "interfaz-6f87f.firebasestorage.app",
  messagingSenderId: "285524906988",
  appId: "1:285524906988:web:fdd5e0a718be6f462f26c9",
  measurementId: "G-SF9RSN70YP"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const iso = (d) => {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const x = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${x}`;
};

let events = [];
let filter = "all";
let eventsRef = null;
let unsubscribe = null;

/* ---------- Autenticación ---------- */
const authMessages = {
  "auth/invalid-email": "El correo no es válido.",
  "auth/missing-password": "Escribe tu contraseña.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/email-already-in-use": "Ese correo ya tiene una cuenta. Inicia sesión.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/too-many-requests": "Demasiados intentos. Espera un momento."
};
const showAuthErr = (e) => {
  $("#authErr").textContent = authMessages[e.code] || "No se pudo completar la acción. Inténtalo de nuevo.";
};

$("#authForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("#authErr").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value);
  } catch (e) { showAuthErr(e); }
});

$("#signupBtn").addEventListener("click", async () => {
  $("#authErr").textContent = "";
  try {
    await createUserWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value);
  } catch (e) { showAuthErr(e); }
});

$("#logoutBtn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (!user) {
    events = [];
    $("#app").hidden = true;
    $("#auth").hidden = false;
    return;
  }
  $("#auth").hidden = true;
  $("#app").hidden = false;
  $("#hello").textContent = user.email;
  $("#date").value = iso(new Date());

  // Documento del usuario: aparece en Firestore como users/{uid} con sus datos
  setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    email: user.email,
    createdAt: user.metadata.creationTime,
    lastLogin: serverTimestamp()
  }, { merge: true }).catch(() => {});

  // Cada usuario guarda sus eventos en users/{uid}/events
  eventsRef = collection(db, "users", user.uid, "events");
  unsubscribe = onSnapshot(eventsRef, (snap) => {
    events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, showErr);
});

/* ---------- Agenda ---------- */
function showErr() {
  $("#err").textContent = "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.";
}

function render() {
  const list = $("#list");
  const today = iso(new Date());
  list.textContent = "";

  const shown = events
    .filter((e) => {
      if (filter === "today") return e.date === today && !e.done;
      if (filter === "next") return e.date >= today && !e.done;
      if (filter === "done") return e.done;
      return true;
    })
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

  if (!shown.length) {
    list.appendChild(el("p", "empty", "No hay eventos aquí. Agrega uno desde el formulario."));
    return;
  }

  let last = "";
  shown.forEach((e) => {
    if (e.date !== last) {
      last = e.date;
      const label = new Date(e.date + "T00:00:00")
        .toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
      list.appendChild(el("h3", "day" + (e.date === today ? " today" : ""), e.date === today ? "Hoy, " + label : label));
    }
    const row = el("div", "ev" + (e.done ? " done" : ""));

    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = !!e.done;
    cb.setAttribute("aria-label", "Marcar como hecho: " + e.title);
    cb.addEventListener("change", () =>
      updateDoc(doc(eventsRef, e.id), { done: cb.checked }).catch(showErr));

    const body = el("div");
    body.appendChild(el("div", "t", e.title));
    const meta = [e.time, e.note].filter(Boolean).join(" · ");
    if (meta) body.appendChild(el("div", "m", meta));

    const del = el("button", "del", "Borrar");
    del.type = "button";
    del.setAttribute("aria-label", "Borrar: " + e.title);
    del.addEventListener("click", () => deleteDoc(doc(eventsRef, e.id)).catch(showErr));

    row.append(cb, body, del);
    list.appendChild(row);
  });
}

$("#tabs").addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  filter = b.dataset.f;
  document.querySelectorAll("#tabs button")
    .forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  render();
});

$("#f").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("#err").textContent = "";
  const title = $("#title").value.trim();
  const date = $("#date").value;
  if (!title || !date) {
    $("#err").textContent = "Escribe un título y elige una fecha.";
    return;
  }
  try {
    await addDoc(eventsRef, {
      title, date,
      time: $("#time").value,
      note: $("#note").value.trim(),
      done: false,
      created: serverTimestamp()
    });
    $("#title").value = ""; $("#time").value = ""; $("#note").value = "";
    $("#title").focus();
  } catch (e) { showErr(); }
});
