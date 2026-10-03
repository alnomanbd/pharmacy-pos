// The Data API's admin: clients, keys, plans, usage. Talks only to /admin/api.

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => Number(n ?? 0).toLocaleString('en-IN');
const taka = (n) => `৳${num(n)}`;
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const dateOnly = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
/** How far back a plan's figures reach — nothing to say for a catalogue-only plan. */
const reach = (p) => (p.scopes.includes('demand') || p.scopes.includes('districts') ? `; ${p.historyMonths} months back` : '');
const ep = (e) => (e === 'index' ? '/v1' : `/v1/${e}`);
const KINDS = { pharma: 'Pharma company', distributor: 'Distributor', research: 'Research', government: 'Government', other: 'Other' };
const SCOPE_WORDS = { catalogue: 'Catalogue', demand: 'Sales figures', trends: 'Rising & falling', districts: 'By district' };

const session = {
  get token() { try { return sessionStorage.getItem('dataAdminToken') || ''; } catch { return ''; } },
  get name() { try { return sessionStorage.getItem('dataAdminName') || ''; } catch { return ''; } },
  set(token, name) { try { sessionStorage.setItem('dataAdminToken', token); sessionStorage.setItem('dataAdminName', name); } catch { /* the tab forgets */ } },
  clear() { try { sessionStorage.removeItem('dataAdminToken'); } catch { /* nothing held */ } },
};

async function api(path, opts = {}) {
  const res = await fetch(`/admin/api${path}`, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json', 'x-admin-token': session.token, 'x-admin-name': session.name },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) {
    session.clear();
    showSignin(json.error?.message);
    throw new Error(json.error?.message || 'Signed out');
  }
  if (!res.ok) throw new Error(json.error?.message || `Failed (${res.status})`);
  return json.data;
}

let toastTimer;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show${bad ? ' bad' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 2800);
}

/* ------------------------------------------------------------ sign in -- */

function showSignin(message) {
  $('#shell').hidden = true;
  $('#signin').hidden = false;
  $('#signin-error').textContent = message || '';
  const f = $('#signin-form');
  f.name.value = session.name;
  (session.name ? f.token : f.name).focus();
}

$('#signin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  session.set(f.token.value, f.name.value.trim());
  try {
    await api('/plans');
    f.token.value = '';
    start();
  } catch (err) {
    $('#signin-error').textContent = err.message;
  }
});
$('#signout').addEventListener('click', () => {
  session.clear();
  showSignin();
});

function start() {
  $('#signin').hidden = true;
  $('#shell').hidden = false;
  $('#who').textContent = session.name;
  route();
}

/* -------------------------------------------------------------- pages -- */

const main = () => $('#main');
const loading = () => (main().innerHTML = '<p class="muted">Loading…</p>');

function bars(series) {
  const max = Math.max(1, ...series.map((s) => s.calls + s.refused));
  const cols = series
    .map((s) => {
      const tip = `${dateOnly(s.day)}: ${num(s.calls)} calls${s.refused ? `, ${num(s.refused)} refused` : ''}`;
      return `<div class="b" data-tip="${esc(tip)}" aria-label="${esc(tip)}"><span class="ok" style="height:${(s.calls / max) * 100}%"></span><span class="no" style="height:${(s.refused / max) * 100}%"></span></div>`;
    })
    .join('');
  return `<div class="bars" role="img" aria-label="Calls per day, last 30 days">${cols}</div>
    <div class="axis"><span>${dateOnly(series[0]?.day)}</span><span>${dateOnly(series.at(-1)?.day)}</span></div>
    <div class="legend"><span><i style="background:var(--bar)"></i>Answered</span><span><i style="background:var(--bar-refused)"></i>Refused (over limit, not in plan, bad request)</span></div>`;
}

async function overview() {
  loading();
  const d = await api('/overview');
  main().innerHTML = `
    <div class="head"><div><h1>Overview</h1><p class="muted">Figures last rebuilt ${esc(when(d.figuresBuiltAt))} · every figure rests on ${d.minShops}+ shops</p></div></div>
    <div class="tiles">
      <div class="card tile"><div class="k">Active clients</div><div class="v">${num(d.clients.active)}</div><div class="muted small">${num(d.clients.suspended)} suspended</div></div>
      <div class="card tile"><div class="k">Live keys</div><div class="v">${num(d.keys)}</div></div>
      <div class="card tile"><div class="k">Calls today</div><div class="v">${num(d.today.calls)}</div><div class="muted small">${num(d.today.refused)} refused</div></div>
      <div class="card tile"><div class="k">Calls in ${esc(d.month.month)}</div><div class="v">${num(d.month.calls)}</div><div class="muted small">${num(d.month.rows)} rows sent</div></div>
    </div>
    <div class="card"><h2>Calls, last 30 days</h2>${bars(d.series)}</div>
    <div class="grid2">
      <div class="card"><h2>Busiest clients this month</h2>${
        d.topClients.length
          ? `<table><tbody>${d.topClients.map((c) => `<tr class="click" data-go="#/clients/${esc(c.id)}"><td>${esc(c.name)}</td><td class="num">${num(c.calls)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="empty">No calls yet this month.</p>'
      }</div>
      <div class="card"><h2>Most-used endpoints this month</h2>${
        d.topEndpoints.length
          ? `<table><tbody>${d.topEndpoints.map((e) => `<tr><td class="mono">${esc(ep(e.endpoint))}</td><td class="num">${num(e.calls)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="empty">No calls yet this month.</p>'
      }</div>
    </div>`;
}

let plansCache = [];
async function plans() {
  const d = await api('/plans');
  plansCache = d.plans;
  return d;
}

async function clients() {
  loading();
  const [list] = await Promise.all([api('/clients'), plans()]);
  main().innerHTML = `
    <div class="head"><div><h1>Clients</h1><p class="muted">Companies, distributors and researchers who buy figures.</p></div>
      <button class="btn primary" id="new-client" type="button">New client</button></div>
    <div class="card table-wrap">${
      list.length
        ? `<table><thead><tr><th>Name</th><th>Plan</th><th>Status</th><th class="num">Keys</th><th class="num">Calls this month</th><th>Last used</th><th>Contract ends</th></tr></thead><tbody>${list
            .map(
              (c) => `<tr class="click" data-go="#/clients/${esc(c.id)}">
                <td><b>${esc(c.name)}</b><div class="muted small">${esc(KINDS[c.kind] || c.kind)}${c.contactName ? ` · ${esc(c.contactName)}` : ''}</div></td>
                <td>${esc(planName(c.plan))}</td>
                <td>${statusPill(c)}</td>
                <td class="num">${num(c.keys)}</td>
                <td class="num">${num(c.callsThisMonth)}</td>
                <td>${esc(when(c.lastUsedAt))}</td>
                <td>${esc(dateOnly(c.expiresAt))}</td></tr>`,
            )
            .join('')}</tbody></table>`
        : '<p class="empty">No clients yet. Add the first one to give them a key.</p>'
    }</div>`;
  $('#new-client').addEventListener('click', () => clientDialog());
}

const planName = (key) => plansCache.find((p) => p.key === key)?.name || key;
function statusPill(c) {
  if (c.status !== 'active') return '<span class="pill off">Suspended</span>';
  if (c.expiresAt && new Date(c.expiresAt) < new Date()) return '<span class="pill off">Contract ended</span>';
  return '<span class="pill">Active</span>';
}

function clientDialog(c) {
  const dlg = $('#dialog');
  const exp = c?.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 10) : '';
  dlg.innerHTML = `<form method="dialog" id="client-form">
    <h2>${c ? 'Edit client' : 'New client'}</h2>
    <div class="form">
      <label class="wide">Name<input name="name" required minlength="2" maxlength="120" value="${esc(c?.name)}" /></label>
      <label>Kind<select name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${c?.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Plan<select name="plan" required>${plansCache
        .filter((p) => p.isActive || p.key === c?.plan)
        .map((p) => `<option value="${esc(p.key)}" ${c?.plan === p.key ? 'selected' : ''}>${esc(p.name)} — ${taka(p.priceMonthly)}/month</option>`)
        .join('')}</select></label>
      <label>Contact person<input name="contactName" maxlength="120" value="${esc(c?.contactName)}" /></label>
      <label>Email<input name="email" type="email" value="${esc(c?.email)}" /></label>
      <label>Phone<input name="phone" maxlength="40" value="${esc(c?.phone)}" /></label>
      <label>Contract ends<input name="expiresAt" type="date" value="${exp}" /></label>
      ${c ? `<label>Status<select name="status"><option value="active" ${c.status === 'active' ? 'selected' : ''}>Active</option><option value="suspended" ${c.status === 'suspended' ? 'selected' : ''}>Suspended — every key stops</option></select></label>` : ''}
      <label class="wide">Notes<textarea name="notes" rows="3" maxlength="2000">${esc(c?.notes)}</textarea></label>
    </div>
    <p class="error" id="client-error"></p>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" id="client-save" value="save">${c ? 'Save' : 'Add client'}</button></div>
  </form>`;
  dlg.showModal();
  $('#client-form').addEventListener('submit', async (e) => {
    if (e.submitter?.value !== 'save') return;
    e.preventDefault();
    const f = e.currentTarget;
    const body = Object.fromEntries(new FormData(f));
    try {
      $('#client-save').disabled = true;
      if (c) {
        await api(`/clients/${c.id}`, { method: 'PATCH', body });
        toast('Saved.');
        dlg.close();
        clientPage(c.id);
      } else {
        const r = await api('/clients', { method: 'POST', body });
        toast('Client added. Make them a key next.');
        dlg.close();
        location.hash = `#/clients/${r.id}`;
      }
    } catch (err) {
      $('#client-error').textContent = err.message;
      $('#client-save').disabled = false;
    }
  });
}

let freshKey = null;
async function clientPage(id) {
  loading();
  const [c] = await Promise.all([api(`/clients/${id}`), plansCache.length ? null : plans()]);
  const plan = plansCache.find((p) => p.key === c.plan);
  const live = c.keys.filter((k) => !k.revokedAt);
  const dead = c.keys.filter((k) => k.revokedAt);
  const shown = freshKey;
  freshKey = null;
  main().innerHTML = `
    <div class="head"><div><p class="small"><a href="#/clients">← Clients</a></p><h1>${esc(c.name)}</h1>
      <p class="muted">${esc(KINDS[c.kind] || c.kind)} · ${statusPill(c)} · on <b>${esc(plan?.name || c.plan)}</b>${plan ? ` (${plan.scopes.map((s) => SCOPE_WORDS[s] || s).join(', ')}${reach(plan)})` : ''}</p></div>
      <button class="btn" id="edit-client" type="button">Edit</button></div>
    <div class="tiles">
      <div class="card tile"><div class="k">Calls today</div><div class="v">${num(c.usage.callsToday)}</div><div class="muted small">of ${num(plan?.requestsPerDay)}</div></div>
      <div class="card tile"><div class="k">Calls this month</div><div class="v">${num(c.usage.callsThisMonth)}</div><div class="muted small">of ${num(plan?.requestsPerMonth)}</div></div>
      <div class="card tile"><div class="k">Live keys</div><div class="v">${live.length}</div></div>
      <div class="card tile"><div class="k">Contract ends</div><div class="v" style="font-size:18px">${esc(dateOnly(c.expiresAt))}</div></div>
    </div>
    <div class="card"><div class="head" style="margin-bottom:8px"><h2 style="margin:0">Keys</h2><button class="btn primary" id="new-key" type="button">New key</button></div>
      ${shown ? `<div class="newkey"><b>Copy this key now — it is not shown again.</b><code class="mono" id="the-key">${esc(shown)}</code><div><button class="btn" id="copy-key" type="button">Copy</button></div><span class="muted small">Send it to the client privately. They send it as <span class="mono">Authorization: Bearer …</span></span></div>` : ''}
      ${
        c.keys.length
          ? `<div class="table-wrap"><table><thead><tr><th>Key</th><th>Label</th><th>Made</th><th>Last used</th><th></th></tr></thead><tbody>${[...live, ...dead]
              .map(
                (k) => `<tr><td class="mono">${esc(k.prefix)}…</td><td>${esc(k.label) || '<span class="muted">—</span>'}</td><td>${esc(dateOnly(k.createdAt))}<div class="muted small">${esc(k.createdBy)}</div></td><td>${esc(when(k.lastUsedAt))}</td>
                <td class="num">${k.revokedAt ? `<span class="pill grey">Revoked ${esc(dateOnly(k.revokedAt))}</span>` : `<button class="btn danger" data-revoke="${esc(k.id)}" data-prefix="${esc(k.prefix)}" type="button">Revoke</button>`}</td></tr>`,
              )
              .join('')}</tbody></table></div>`
          : '<p class="empty">No keys yet.</p>'
      }</div>
    <div class="card" style="margin-top:14px"><h2>Calls, last 30 days</h2>${bars(c.usage.series)}</div>
    <div class="grid2">
      <div class="card"><h2>Endpoints, last 30 days</h2>${
        c.usage.endpoints.length
          ? `<table><thead><tr><th>Endpoint</th><th class="num">Calls</th><th class="num">Rows</th></tr></thead><tbody>${c.usage.endpoints.map((e) => `<tr><td class="mono">${esc(ep(e.endpoint))}</td><td class="num">${num(e.calls)}</td><td class="num">${num(e.rows)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="empty">No calls yet.</p>'
      }</div>
      <div class="card"><h2>Contact</h2><p>${esc(c.contactName) || '—'}<br/>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}<br/>${esc(c.phone)}</p>${c.notes ? `<p class="muted" style="white-space:pre-wrap">${esc(c.notes)}</p>` : ''}
        <h2 style="margin-top:16px">Changes</h2>${c.log.length ? `<table><tbody>${c.log.map((l) => `<tr><td>${esc(logWords(l))}</td><td class="muted small">${esc(l.by)}<br/>${esc(when(l.at))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">None.</p>'}
      </div>
    </div>`;

  $('#edit-client').addEventListener('click', () => clientDialog(c));
  $('#copy-key')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#the-key').textContent);
      toast('Copied.');
    } catch {
      toast('Select the key and copy it by hand.', true);
    }
  });
  $('#new-key').addEventListener('click', async () => {
    const label = prompt('A label for this key (for example: "Production server")', '') ?? null;
    if (label === null) return;
    try {
      const r = await api(`/clients/${id}/keys`, { method: 'POST', body: { label } });
      freshKey = r.key;
      clientPage(id);
    } catch (err) {
      toast(err.message, true);
    }
  });
  main().querySelectorAll('[data-revoke]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm(`Revoke ${b.dataset.prefix}…? Anything using it stops working within a minute.`)) return;
      try {
        await api(`/keys/${b.dataset.revoke}/revoke`, { method: 'POST' });
        toast('Key revoked.');
        clientPage(id);
      } catch (err) {
        toast(err.message, true);
      }
    }),
  );
}

function logWords(l) {
  const d = l.detail || {};
  switch (l.action) {
    case 'client.create': return `Client added on ${planName(d.plan)}`;
    case 'client.update': return `Client changed: ${(d.changed || []).join(', ')}`;
    case 'key.create': return `Key ${d.prefix}… made${d.label ? ` (${d.label})` : ''}`;
    case 'key.revoke': return `Key ${d.prefix}… revoked`;
    case 'plan.create': return `Plan ${d.name} added`;
    case 'plan.update': return `Plan ${d.name} changed`;
    default: return l.action;
  }
}

async function plansPage() {
  loading();
  const d = await plans();
  main().innerHTML = `
    <div class="head"><div><h1>Plans</h1><p class="muted">What each client pays for. A change reaches every client on that plan within a minute.</p></div>
      <button class="btn primary" id="new-plan" type="button">New plan</button></div>
    <div class="grid2" style="margin-top:0">${d.plans
      .map(
        (p) => `<div class="card"><div class="head" style="margin-bottom:6px"><div><h2 style="margin:0">${esc(p.name)} ${p.isActive ? '' : '<span class="pill grey">Not offered</span>'}</h2><span class="muted small mono">${esc(p.key)}</span></div>
          <button class="btn" data-plan="${esc(p.key)}" type="button">Edit</button></div>
          <p class="muted">${esc(p.description)}</p>
          <p><b>${taka(p.priceMonthly)}</b> a month · ${num(p.clients)} client${p.clients === 1 ? '' : 's'}</p>
          <p class="small">${p.scopes.map((s) => `<span class="pill">${esc(SCOPE_WORDS[s] || s)}</span>`).join(' ')}</p>
          <p class="small muted">${reach(p).slice(2)}${reach(p) ? ' · ' : ''}${num(p.requestsPerMinute)}/minute · ${num(p.requestsPerDay)}/day · ${num(p.requestsPerMonth)}/month</p></div>`,
      )
      .join('')}</div>`;
  $('#new-plan').addEventListener('click', () => planDialog(null, d.scopes));
  main().querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => planDialog(d.plans.find((p) => p.key === b.dataset.plan), d.scopes)));
}

function planDialog(p, scopes) {
  const dlg = $('#dialog');
  dlg.innerHTML = `<form method="dialog" id="plan-form">
    <h2>${p ? `Edit ${esc(p.name)}` : 'New plan'}</h2>
    <div class="form">
      <label>Key<input name="key" required pattern="[a-z0-9-]{2,40}" value="${esc(p?.key)}" ${p ? 'readonly' : ''} placeholder="for example: insight-plus" /></label>
      <label>Name<input name="name" required minlength="2" maxlength="60" value="${esc(p?.name)}" /></label>
      <label class="wide">Description<textarea name="description" rows="2" maxlength="400">${esc(p?.description)}</textarea></label>
      <div class="wide"><b class="small">Includes</b><div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px">${scopes
        .map((s) => `<label class="check"><input type="checkbox" name="scopes" value="${s}" ${p?.scopes.includes(s) ? 'checked' : ''} />${esc(SCOPE_WORDS[s] || s)}</label>`)
        .join('')}</div></div>
      <label>Months back<input name="historyMonths" type="number" min="0" max="120" required value="${p?.historyMonths ?? 12}" /></label>
      <label>Price a month (৳)<input name="priceMonthly" type="number" min="0" step="1" required value="${p?.priceMonthly ?? 0}" /></label>
      <label>Calls a minute<input name="requestsPerMinute" type="number" min="1" required value="${p?.requestsPerMinute ?? 60}" /></label>
      <label>Calls a day<input name="requestsPerDay" type="number" min="1" required value="${p?.requestsPerDay ?? 1000}" /></label>
      <label>Calls a month<input name="requestsPerMonth" type="number" min="1" required value="${p?.requestsPerMonth ?? 20000}" /></label>
      <label class="check" style="align-self:end"><input type="checkbox" name="isActive" ${p?.isActive === false ? '' : 'checked'} />Offered to new clients</label>
    </div>
    <p class="error" id="plan-error"></p>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" id="plan-save" value="save">Save plan</button></div>
  </form>`;
  dlg.showModal();
  $('#plan-form').addEventListener('submit', async (e) => {
    if (e.submitter?.value !== 'save') return;
    e.preventDefault();
    const f = e.currentTarget;
    const fd = new FormData(f);
    const body = {
      name: fd.get('name'),
      description: fd.get('description'),
      scopes: fd.getAll('scopes'),
      historyMonths: Number(fd.get('historyMonths')),
      priceMonthly: Number(fd.get('priceMonthly')),
      requestsPerMinute: Number(fd.get('requestsPerMinute')),
      requestsPerDay: Number(fd.get('requestsPerDay')),
      requestsPerMonth: Number(fd.get('requestsPerMonth')),
      isActive: fd.get('isActive') === 'on',
    };
    if (!body.scopes.length) return void ($('#plan-error').textContent = 'Pick at least one part.');
    try {
      $('#plan-save').disabled = true;
      await api(`/plans/${encodeURIComponent(fd.get('key'))}`, { method: 'PUT', body });
      toast('Plan saved.');
      dlg.close();
      plansPage();
    } catch (err) {
      $('#plan-error').textContent = err.message;
      $('#plan-save').disabled = false;
    }
  });
}

async function logPage() {
  loading();
  const [rows] = await Promise.all([api('/log'), plansCache.length ? null : plans()]);
  main().innerHTML = `<div class="head"><div><h1>Changes</h1><p class="muted">Everything changed here, newest first, with who said they made it.</p></div></div>
    <div class="card table-wrap">${
      rows.length
        ? `<table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Client</th></tr></thead><tbody>${rows
            .map((l) => `<tr><td>${esc(when(l.at))}</td><td>${esc(l.by)}</td><td>${esc(logWords(l))}</td><td>${l.client ? `<a href="#/clients/${esc(l.client)}">${esc(l.clientName || 'client')}</a>` : ''}</td></tr>`)
            .join('')}</tbody></table>`
        : '<p class="empty">Nothing changed yet.</p>'
    }</div>`;
}

/* ------------------------------------------------------------- router -- */

async function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [, page, id] = h.split('/');
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (page || 'overview')));
  try {
    if (!page) await overview();
    else if (page === 'clients' && id) await clientPage(id);
    else if (page === 'clients') await clients();
    else if (page === 'plans') await plansPage();
    else if (page === 'log') await logPage();
    else await overview();
    main().focus();
  } catch (err) {
    if ($('#shell').hidden) return;
    main().innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

window.addEventListener('hashchange', () => !$('#shell').hidden && route());
document.addEventListener('click', (e) => {
  const row = e.target.closest('[data-go]');
  if (row && !e.target.closest('a,button')) location.hash = row.dataset.go;
});

if (session.token) start();
else showSignin();
