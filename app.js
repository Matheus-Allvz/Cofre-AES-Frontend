"use strict";

const API_BASE = "https://vault.matheus-alves.dev";

// In-memory session state only. Never write senhaMestra (or any secret
// password) to localStorage/sessionStorage/cookies — it must vanish on
// reload, that is intentional.
const state = {
  cofreId: null,
  senhaMestra: null,
  segredos: [],
};

// ---------- helpers ----------

function $(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => (el.hidden = true));
  $(id).hidden = false;
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function hideError(el) {
  el.hidden = true;
  el.textContent = "";
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2500);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // fallback for non-secure/older contexts
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

// Maps API errors to clear, specific messages. Never a generic alert.
function messageForStatus(status, context) {
  switch (status) {
    case 401:
      return "Senha-mestra incorreta.";
    case 404:
      return "Não encontrado.";
    case 500:
      return "Registro adulterado ou corrompido no servidor.";
    default:
      return `Erro inesperado (HTTP ${status}).`;
  }
}

class ApiError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function api(path, { method = "GET", body, senhaMestra } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (senhaMestra) headers["X-Senha-Mestra"] = senhaMestra;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let errBody = null;
    try { errBody = await res.json(); } catch (e) { /* no body */ }
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return null;
  try { return await res.json(); } catch (e) { return null; }
}

// ---------- navigation wiring ----------

document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => showScreen(btn.dataset.back));
});

$("btn-goto-create").addEventListener("click", () => {
  $("form-create").reset();
  hideError($("create-error"));
  showScreen("screen-create");
});

$("btn-goto-open").addEventListener("click", () => {
  $("form-open").reset();
  hideError($("open-error"));
  showScreen("screen-open");
});

$("btn-sair").addEventListener("click", () => {
  state.cofreId = null;
  state.senhaMestra = null;
  state.segredos = [];
  $("vault-badge").hidden = true;
  showScreen("screen-home");
});

// ---------- create vault ----------

$("form-create").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError($("create-error"));

  const nome = $("create-nome").value.trim();
  const senha = $("create-senha").value;
  const confirma = $("create-senha-confirma").value;

  if (senha !== confirma) {
    showError($("create-error"), "As senhas-mestra digitadas não coincidem.");
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    const result = await api("/cofres", { method: "POST", body: { nome, senha_mestra: senha } });
    $("new-vault-id").textContent = result.id;
    $("confirm-saved-id").checked = false;
    $("btn-continue-dashboard").disabled = true;

    // Keep credentials in memory only; move on to the "save this id" screen.
    state.cofreId = result.id;
    state.senhaMestra = senha;
    showScreen("screen-create-result");
  } catch (err) {
    showError($("create-error"), messageForStatus(err.status));
  } finally {
    submitBtn.disabled = false;
  }
});

$("btn-copy-id").addEventListener("click", async () => {
  const ok = await copyToClipboard($("new-vault-id").textContent);
  toast(ok ? "ID copiado." : "Não foi possível copiar automaticamente — selecione e copie manualmente.");
});

$("confirm-saved-id").addEventListener("change", (e) => {
  $("btn-continue-dashboard").disabled = !e.target.checked;
});

$("btn-continue-dashboard").addEventListener("click", () => {
  enterDashboard();
});

// ---------- open existing vault ----------

$("form-open").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError($("open-error"));

  const cofreId = $("open-id").value.trim();
  const senha = $("open-senha").value;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    // Validate the master password before showing anything from the vault.
    await api(`/cofres/${encodeURIComponent(cofreId)}/abrir`, { method: "POST", senhaMestra: senha });
    state.cofreId = cofreId;
    state.senhaMestra = senha;
    await enterDashboard();
  } catch (err) {
    showError($("open-error"), messageForStatus(err.status));
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- dashboard ----------

async function enterDashboard() {
  $("vault-badge-id").textContent = state.cofreId;
  $("vault-badge").hidden = false;
  showScreen("screen-dashboard");
  await loadSecrets();
}

async function loadSecrets() {
  hideError($("dashboard-error"));
  try {
    state.segredos = await api(`/cofres/${encodeURIComponent(state.cofreId)}/segredos`, {
      senhaMestra: state.senhaMestra,
    });
    renderSecretList();
  } catch (err) {
    showError($("dashboard-error"), messageForStatus(err.status));
  }
}

function renderSecretList() {
  const list = $("secret-list");
  list.innerHTML = "";
  $("dashboard-empty").hidden = state.segredos.length !== 0;

  for (const segredo of state.segredos) {
    list.appendChild(renderSecretItem(segredo));
  }
}

function renderSecretItem(segredo) {
  const li = document.createElement("li");
  li.className = "secret-item";
  li.dataset.id = segredo.id;

  const sub = [segredo.usuario, segredo.url].filter(Boolean).join(" · ");

  li.innerHTML = `
    <div class="secret-item-main">
      <div class="secret-item-info">
        <div class="secret-item-title"></div>
        <div class="secret-item-sub"></div>
      </div>
      <div class="secret-item-actions">
        <button class="btn btn-secondary btn-sm" data-action="ver">Ver senha</button>
        <button class="btn btn-secondary btn-sm" data-action="editar">Editar</button>
        <button class="btn btn-danger btn-sm" data-action="excluir">Excluir</button>
      </div>
    </div>
    <p class="error-msg" data-role="item-error" hidden></p>
  `;
  li.querySelector(".secret-item-title").textContent = segredo.titulo;
  li.querySelector(".secret-item-sub").textContent = sub;

  li.querySelector('[data-action="ver"]').addEventListener("click", (e) => toggleVerSenha(li, segredo, e.target));
  li.querySelector('[data-action="editar"]').addEventListener("click", () => openSecretModal(segredo));
  li.querySelector('[data-action="excluir"]').addEventListener("click", () => excluirSecret(li, segredo));

  return li;
}

async function toggleVerSenha(li, segredo, btn) {
  const existing = li.querySelector(".secret-item-password");
  if (existing) {
    existing.remove();
    btn.textContent = "Ver senha";
    return;
  }

  const itemError = li.querySelector('[data-role="item-error"]');
  hideError(itemError);
  btn.disabled = true;
  try {
    const result = await api(`/cofres/${encodeURIComponent(state.cofreId)}/segredos/${encodeURIComponent(segredo.id)}`, {
      senhaMestra: state.senhaMestra,
    });
    const box = document.createElement("div");
    box.className = "secret-item-password";
    box.innerHTML = `<span class="pw-text"></span><button class="btn btn-ghost btn-sm" type="button">Copiar</button>`;
    box.querySelector(".pw-text").textContent = result.senha;
    box.querySelector("button").addEventListener("click", async () => {
      const ok = await copyToClipboard(result.senha);
      toast(ok ? "Senha copiada." : "Não foi possível copiar automaticamente.");
    });
    li.querySelector(".secret-item-main").after(box);
    btn.textContent = "Ocultar senha";
  } catch (err) {
    showError(itemError, messageForStatus(err.status));
  } finally {
    btn.disabled = false;
  }
}

async function excluirSecret(li, segredo) {
  if (!confirm(`Excluir o segredo "${segredo.titulo}"? Essa ação não pode ser desfeita.`)) return;

  const itemError = li.querySelector('[data-role="item-error"]');
  hideError(itemError);
  try {
    await api(`/cofres/${encodeURIComponent(state.cofreId)}/segredos/${encodeURIComponent(segredo.id)}`, {
      method: "DELETE",
      senhaMestra: state.senhaMestra,
    });
    state.segredos = state.segredos.filter((s) => s.id !== segredo.id);
    renderSecretList();
    toast("Segredo excluído.");
  } catch (err) {
    showError(itemError, messageForStatus(err.status));
  }
}

// ---------- secret create/edit modal ----------

let editingSecretId = null;

$("btn-new-secret").addEventListener("click", () => openSecretModal(null));
$("btn-cancel-secret").addEventListener("click", closeSecretModal);

async function openSecretModal(segredo) {
  $("form-secret").reset();
  hideError($("secret-form-error"));
  editingSecretId = segredo ? segredo.id : null;
  $("modal-secret-title").textContent = segredo ? "Editar segredo" : "Novo segredo";

  if (segredo) {
    $("secret-titulo").value = segredo.titulo;
    $("secret-usuario").value = segredo.usuario || "";
    $("secret-url").value = segredo.url || "";
    // The list endpoint never returns the password; fetch it so editing
    // doesn't silently blank it out on save.
    try {
      const result = await api(`/cofres/${encodeURIComponent(state.cofreId)}/segredos/${encodeURIComponent(segredo.id)}`, {
        senhaMestra: state.senhaMestra,
      });
      $("secret-senha").value = result.senha;
    } catch (err) {
      showError($("secret-form-error"), messageForStatus(err.status));
    }
  }

  $("modal-secret").hidden = false;
}

function closeSecretModal() {
  $("modal-secret").hidden = true;
  editingSecretId = null;
}

$("form-secret").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError($("secret-form-error"));

  const body = {
    titulo: $("secret-titulo").value.trim(),
    usuario: $("secret-usuario").value.trim() || null,
    url: $("secret-url").value.trim() || null,
    senha: $("secret-senha").value,
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    if (editingSecretId) {
      await api(`/cofres/${encodeURIComponent(state.cofreId)}/segredos/${encodeURIComponent(editingSecretId)}`, {
        method: "PUT",
        body,
        senhaMestra: state.senhaMestra,
      });
      toast("Segredo atualizado.");
    } else {
      await api(`/cofres/${encodeURIComponent(state.cofreId)}/segredos`, {
        method: "POST",
        body,
        senhaMestra: state.senhaMestra,
      });
      toast("Segredo criado.");
    }
    closeSecretModal();
    await loadSecrets();
  } catch (err) {
    showError($("secret-form-error"), messageForStatus(err.status));
  } finally {
    submitBtn.disabled = false;
  }
});

// start on the home screen
showScreen("screen-home");
