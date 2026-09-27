const API = 'http://127.0.0.1:4444/';

function setStatus(ok, connected) {
  const el = document.getElementById('status');
  if (!ok) {
    el.textContent = 'offline';
    el.className = 'pill off';
    return;
  }
  el.textContent = connected ? 'conectado' : 'sem Discord';
  el.className = 'pill ' + (connected ? 'on' : 'off');
}

async function load() {
  try {
    const res = await fetch(API);
    const st = await res.json();
    const c = st.config || {};
    document.getElementById('clientId').value = c.clientId || '';
    document.getElementById('credit').value = c.credit || '';
    document.getElementById('thumbFit').value = c.thumbFit || 'cover';
    setStatus(true, !!st.discordConnected);
  } catch (e) {
    setStatus(false);
  }
}

async function save() {
  const msg = document.getElementById('msg');
  msg.className = '';
  msg.textContent = 'Salvando…';
  try {
    const res = await fetch(API + 'config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: document.getElementById('clientId').value.trim(),
        credit: document.getElementById('credit').value,
        thumbFit: document.getElementById('thumbFit').value,
      }),
    });
    const j = await res.json();
    msg.textContent = j.ok ? 'Salvo! O status atualiza em segundos.' : 'Erro ao salvar.';
    if (!j.ok) msg.className = 'err';
  } catch (e) {
    msg.textContent = 'Servidor não está rodando. Inicie o Wytch RPC.';
    msg.className = 'err';
  }
}

document.getElementById('save').addEventListener('click', save);
load();
