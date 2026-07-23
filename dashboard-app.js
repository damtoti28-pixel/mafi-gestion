import { firebaseConfig } from "./config-firebase.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, updateDoc,
  query, orderBy, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Persistance hors-ligne non activée:", err.code);
});

const opsCollection = collection(db, "operations");

let operations = [];
let currentOpType = "dette";
let currentEditId = null;
let currentEditStatus = "en_attente";
let currentEditType = "dette";
let currentPersonName = null;

const fmt = (n) => Number(n || 0).toLocaleString("fr-FR") + " F";

function formatDateHeure(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR") + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

// ---------- Réseau / synchro ----------
function updateSyncPill() {
  const pill = document.getElementById("sync-pill");
  const label = document.getElementById("sync-label");
  const banner = document.getElementById("offline-banner");
  if (navigator.onLine) {
    pill.classList.remove("offline");
    label.textContent = "connecté";
    banner.classList.add("hidden");
  } else {
    pill.classList.add("offline");
    label.textContent = "hors-ligne";
    banner.classList.remove("hidden");
  }
}
window.addEventListener("online", updateSyncPill);
window.addEventListener("offline", updateSyncPill);
updateSyncPill();

// ---------- Firestore listener ----------
const q = query(opsCollection, orderBy("dateCreation", "desc"));
onSnapshot(q, (snapshot) => {
  operations = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderAll();
}, (error) => {
  console.error("Erreur de synchronisation:", error);
});

function renderAll() {
  renderStats();
  renderPeopleList(document.getElementById("search-people").value);
  renderRecapOptions();
  refreshDatalist();
  if (currentPersonName) renderRecap(currentPersonName);
}

// ---------- Regroupement par personne ----------
function getPeople() {
  const map = new Map();
  for (const op of operations) {
    if (!map.has(op.personneNom)) {
      map.set(op.personneNom, { nom: op.personneNom, dette: 0, relicat: 0, ops: [] });
    }
    const p = map.get(op.personneNom);
    p.ops.push(op);
    if (op.statut === "en_attente") {
      if (op.type === "dette") p.dette += Number(op.montant);
      else p.relicat += Number(op.montant);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom));
}

function renderStats() {
  const people = getPeople();
  const totalDette = people.reduce((s, p) => s + p.dette, 0);
  const totalRelicat = people.reduce((s, p) => s + p.relicat, 0);
  document.getElementById("stat-dettes").textContent = fmt(totalDette);
  document.getElementById("stat-relicats").textContent = fmt(totalRelicat);
  document.getElementById("stat-personnes").textContent = people.length;
}

function renderPeopleList(filterText = "") {
  const container = document.getElementById("people-list");
  const people = getPeople().filter(p =>
    p.nom.toLowerCase().includes(filterText.toLowerCase())
  );
  if (people.length === 0) {
    container.innerHTML = `<p class="empty-state">aucune personne trouvée.</p>`;
    return;
  }
  container.innerHTML = people.map(p => `
    <div class="person-row">
      <div class="person-avatar">${initials(p.nom)}</div>
      <div class="person-name">${p.nom}</div>
      <div class="person-amounts">
        ${p.dette > 0 ? `<span class="badge dette">dette ${fmt(p.dette)}</span>` : ""}
        ${p.relicat > 0 ? `<span class="badge relicat">relicat ${fmt(p.relicat)}</span>` : ""}
        ${p.dette === 0 && p.relicat === 0 ? `<span class="badge zero">à jour</span>` : ""}
      </div>
      <button class="btn-small settle" data-person="${p.nom}">gérer</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-person]").forEach(btn => {
    btn.addEventListener("click", () => openPersonModal(btn.dataset.person));
  });
}

function refreshDatalist() {
  const list = document.getElementById("people-datalist");
  const names = getPeople().map(p => p.nom);
  list.innerHTML = names.map(n => `<option value="${n}">`).join("");
}

// ---------- Modal : nouvelle opération ----------
const modalOp = document.getElementById("modal-op");
document.getElementById("btn-open-dette").addEventListener("click", () => openOpModal("dette"));
document.getElementById("btn-open-relicat").addEventListener("click", () => openOpModal("relicat"));
document.getElementById("modal-op-close").addEventListener("click", () => modalOp.classList.add("hidden"));

function openOpModal(type) {
  currentOpType = type;
  document.getElementById("modal-op-title").textContent = type === "dette" ? "nouvelle dette" : "nouveau relicat";
  setTypeButtons(type);
  document.getElementById("op-nom").value = "";
  document.getElementById("op-montant").value = "";
  const now = new Date();
  document.getElementById("op-datetime-hint").textContent =
    "enregistré le " + now.toLocaleDateString("fr-FR") + " à " + now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  modalOp.classList.remove("hidden");
}

function setTypeButtons(type) {
  document.getElementById("type-dette-btn").classList.toggle("active", type === "dette");
  document.getElementById("type-relicat-btn").classList.toggle("active", type === "relicat");
  currentOpType = type;
}

document.getElementById("type-dette-btn").addEventListener("click", () => setTypeButtons("dette"));
document.getElementById("type-relicat-btn").addEventListener("click", () => setTypeButtons("relicat"));

document.getElementById("form-op").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nom = document.getElementById("op-nom").value.trim();
  const montant = Number(document.getElementById("op-montant").value);
  if (!nom || !montant) return;
  await addDoc(opsCollection, {
    personneNom: nom,
    type: currentOpType,
    montant: montant,
    statut: "en_attente",
    dateCreation: new Date().toISOString(),
    dateReglement: null
  });
  modalOp.classList.add("hidden");
});

// ---------- Modal : opérations d'une personne ----------
const modalPerson = document.getElementById("modal-person");
document.getElementById("modal-person-close").addEventListener("click", () => modalPerson.classList.add("hidden"));

function openPersonModal(nom) {
  document.getElementById("modal-person-name").textContent = nom;
  renderPersonOps(nom);
  modalPerson.classList.remove("hidden");
}

function renderPersonOps(nom) {
  const container = document.getElementById("modal-person-ops");
  const ops = operations.filter(o => o.personneNom === nom)
    .sort((a, b) => new Date(b.dateCreation) - new Date(a.dateCreation));
  container.innerHTML = ops.map(o => `
    <div class="op-row">
      <div class="op-meta">
        <span class="badge ${o.type}">${o.type} ${fmt(o.montant)}</span>
        <div class="op-date">${formatDateHeure(o.dateCreation)} — ${o.statut === "reglee" ? "réglée" : "en attente"}</div>
      </div>
      ${o.statut === "en_attente" ? `<button class="btn-small settle" data-settle="${o.id}">régler</button>` : ""}
      <button class="btn-small edit" data-edit="${o.id}">modifier</button>
    </div>
  `).join("") || `<p class="empty-state">aucune opération.</p>`;

  container.querySelectorAll("[data-settle]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateDoc(doc(db, "operations", btn.dataset.settle), {
        statut: "reglee",
        dateReglement: new Date().toISOString()
      });
      renderPersonOps(nom);
    });
  });
  container.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(btn.dataset.edit, nom));
  });
}

// ---------- Modal : modifier une opération ----------
const modalEdit = document.getElementById("modal-edit");
document.getElementById("modal-edit-close").addEventListener("click", () => modalEdit.classList.add("hidden"));

function openEditModal(opId, personNom) {
  const op = operations.find(o => o.id === opId);
  if (!op) return;
  currentEditId = opId;
  currentEditType = op.type;
  currentEditStatus = op.statut;
  document.getElementById("edit-montant").value = op.montant;
  setEditTypeButtons(op.type);
  setEditStatusButtons(op.statut);
  modalEdit.dataset.personNom = personNom;
  modalEdit.classList.remove("hidden");
}

function setEditTypeButtons(type) {
  currentEditType = type;
  document.getElementById("edit-type-dette-btn").classList.toggle("active", type === "dette");
  document.getElementById("edit-type-relicat-btn").classList.toggle("active", type === "relicat");
}
function setEditStatusButtons(status) {
  currentEditStatus = status;
  document.getElementById("edit-status-attente-btn").classList.toggle("active", status === "en_attente");
  document.getElementById("edit-status-reglee-btn").classList.toggle("active", status === "reglee");
}

document.getElementById("edit-type-dette-btn").addEventListener("click", () => setEditTypeButtons("dette"));
document.getElementById("edit-type-relicat-btn").addEventListener("click", () => setEditTypeButtons("relicat"));
document.getElementById("edit-status-attente-btn").addEventListener("click", () => setEditStatusButtons("en_attente"));
document.getElementById("edit-status-reglee-btn").addEventListener("click", () => setEditStatusButtons("reglee"));

document.getElementById("form-edit").addEventListener("submit", async (e) => {
  e.preventDefault();
  const montant = Number(document.getElementById("edit-montant").value);
  await updateDoc(doc(db, "operations", currentEditId), {
    type: currentEditType,
    montant: montant,
    statut: currentEditStatus
  });
  modalEdit.classList.add("hidden");
  const personNom = modalEdit.dataset.personNom;
  if (personNom) renderPersonOps(personNom);
});

// ---------- Recherche ----------
document.getElementById("search-people").addEventListener("input", (e) => {
  renderPeopleList(e.target.value);
});

// ---------- Récapitulatif ----------
function renderRecapOptions() {
  const select = document.getElementById("recap-select");
  const current = select.value;
  const people = getPeople();
  select.innerHTML = `<option value="">choisir une personne...</option>` +
    people.map(p => `<option value="${p.nom}">${p.nom}</option>`).join("");
  if (people.some(p => p.nom === current)) select.value = current;
}

document.getElementById("recap-select").addEventListener("change", (e) => {
  currentPersonName = e.target.value || null;
  renderRecap(currentPersonName);
});

function renderRecap(nom) {
  const container = document.getElementById("recap-content");
  if (!nom) {
    container.innerHTML = `<p class="empty-state">sélectionnez une personne pour voir son historique.</p>`;
    return;
  }
  const ops = operations.filter(o => o.personneNom === nom)
    .sort((a, b) => new Date(b.dateCreation) - new Date(a.dateCreation));

  container.innerHTML = `
    <div class="recap-header-row">
      <span></span>
      <button class="btn-small edit" id="btn-print-pdf">imprimer en pdf</button>
    </div>
    <table class="recap-table">
      <thead>
        <tr><th>date</th><th>heure</th><th>type</th><th>montant</th><th>statut</th></tr>
      </thead>
      <tbody>
        ${ops.map(o => {
          const d = new Date(o.dateCreation);
          return `<tr>
            <td>${d.toLocaleDateString("fr-FR")}</td>
            <td>${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</td>
            <td>${o.type}</td>
            <td>${fmt(o.montant)}</td>
            <td>${o.statut === "reglee" ? "réglée" : "en attente"}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;

  document.getElementById("btn-print-pdf").addEventListener("click", () => printPersonReport(nom, ops));
}

function printPersonReport(nom, ops) {
  const totalDette = ops.filter(o => o.type === "dette" && o.statut === "en_attente").reduce((s, o) => s + Number(o.montant), 0);
  const totalRelicat = ops.filter(o => o.type === "relicat" && o.statut === "en_attente").reduce((s, o) => s + Number(o.montant), 0);
  const printArea = document.getElementById("print-area");
  printArea.innerHTML = `
    <h2>mafii gestion — rapport de situation</h2>
    <p><strong>personne :</strong> ${nom}</p>
    <p><strong>date d'édition :</strong> ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
    <p><strong>dette en attente :</strong> ${fmt(totalDette)} &nbsp; | &nbsp; <strong>relicat en attente :</strong> ${fmt(totalRelicat)}</p>
    <table border="1" cellspacing="0" cellpadding="6" style="width:100%; border-collapse:collapse; margin-top:16px;">
      <thead><tr><th>date</th><th>heure</th><th>type</th><th>montant</th><th>statut</th></tr></thead>
      <tbody>
        ${ops.map(o => {
          const d = new Date(o.dateCreation);
          return `<tr>
            <td>${d.toLocaleDateString("fr-FR")}</td>
            <td>${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</td>
            <td>${o.type}</td>
            <td>${fmt(o.montant)}</td>
            <td>${o.statut === "reglee" ? "réglée" : "en attente"}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
  window.print();
}
