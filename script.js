const S = { members: [], services: [], giving: [], events: [], notices: [], messages: [] };
const ZONES = ['North Zone', 'South Zone', 'East Zone', 'West Zone', 'Hostel Zone'];
const DEPTS = ['Choir', 'Ushers', 'Media', 'Prayer', 'Evangelism', 'Protocol', 'Welfare'];
const TYPES = ['Sunday service', 'Midweek service', 'Prayer meeting', 'Fellowship'];
const CATS = ['Tithe', 'Offering', 'Thanksgiving', 'Project'];
const ROLES = { member: 'Member', admin: 'Admin', super: 'Super admin' };
const TABS = [['me', 'My profile', 'mas'], ['overview', 'Overview', 'as'], ['members', 'Members', 'as'], ['attendance', 'Attendance', 'as'], ['messages', 'Messages', 'as'], ['giving', 'Giving', 's'], ['events', 'Events', 'mas'], ['notices', 'Alerts', 'as']];
let tab = null, db = null, q = '', editing = null, mode = 'login', err = '', fresh = true, anim = false, ready = false, seenInit = false, where = 'saved on this device only';
let sid = null; try { sid = localStorage.getItem('cms_sid') } catch (e) { }
const seen = new Set(), bootAt = Date.now();
const today = new Date().toISOString().slice(0, 10);
const reg = { date: today, type: TYPES[0] };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const regKey = () => reg.date + '_' + slug(reg.type);
const fmt = d => { try { return new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) } catch (e) { return d } };
const short = d => { try { return new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) } catch (e) { return d } };
const nameOf = id => (S.members.find(m => m.id === id) || {}).name || 'Anonymous';
const opts = (arr, sel, blank) => (blank ? `<option value="">${blank}</option>` : '') + arr.map(x => `<option${x === sel ? ' selected' : ''}>${x}</option>`).join('');
const byDate = (a, b) => a.date < b.date ? -1 : 1;

/* accounts and permissions */
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
async function hashPw(pw, salt) { const enc = new TextEncoder(); const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']); return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, k, 256)) }
const me = () => S.members.find(m => m.id === sid);
const isSuper = u => !!u && u.role === 'super', isAdmin = u => !!u && u.role === 'admin';
const covers = (a, m) => isSuper(a) || (isAdmin(a) && m.id !== a.id && m.role === 'member' && ((a.zone && m.zone === a.zone) || (a.group && m.group === a.group)));
const canEdit = (u, m) => isSuper(u) || covers(u, m);
const managed = u => S.members.filter(m => covers(u, m));
const vis = u => isSuper(u) ? S.members : isAdmin(u) ? [...managed(u), u] : [u];
const cnt = (s, u) => { const v = new Set(vis(u).map(m => m.id)); return (s.present || []).filter(i => v.has(i)).length };
function notify(actor, before, after, what) {
    const t = new Date().toISOString(), base = { by: actor.id, member: before.id, date: t, read: false, text: `${actor.name} (${ROLES[actor.role]}) ${what} ${before.name}` };
    put('notices', { ...base, to: 'log' });
    S.members.filter(a => isAdmin(a) && a.id !== actor.id && (covers(a, before) || (after && covers(a, after)))).forEach(a => put('notices', { ...base, to: a.id }));
}

/* data layer */
function lsSave(c) { try { localStorage.setItem('cms_' + c, JSON.stringify(S[c])) } catch (e) { } }
async function put(c, obj, id) {
    if (db) { const col = db.collection(c); await (id ? col.doc(id) : col.doc()).set(obj); return }
    id = id || Math.random().toString(36).slice(2);
    const i = S[c].findIndex(x => x.id === id), rec = { ...obj, id };
    if (i < 0) S[c].push(rec); else S[c][i] = rec;
    lsSave(c); render();
}
async function del(c, id) {
    if (db) { await db.collection(c).doc(id).delete(); return }
    S[c] = S[c].filter(x => x.id !== id); lsSave(c); render();
}
function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300) }, 6000);
}
const fail = e => toast('Could not save: ' + (e && e.message || 'try again'));

/* views */
function hero(u) {
    const unread = S.notices.filter(n => n.to === u.id && !n.read).length;
    const line = { member: `${u.zone || 'No zone yet'} · ${u.group || 'No department yet'}`, admin: 'Managing ' + ([u.zone, u.group].filter(Boolean).join(' and ') || 'no zone or department yet'), super: 'Access to the whole campus church' }[u.role];
    return `<section class="hero-card"><div><p class="eyebrow">${ROLES[u.role]} view</p><h2>Welcome, ${esc(u.name.split(' ')[0])}</h2><p>${esc(line)}</p></div>${isAdmin(u) && unread ? `<button class="pill" data-tab="notices">${unread} new alert${unread > 1 ? 's' : ''}</button>` : ''}</section>`;
}
function profile(u) {
    const sv = S.services, mine = sv.filter(s => (s.present || []).includes(u.id)).sort(byDate);
    const pct = sv.length ? Math.round(mine.length / sv.length * 100) : 0;
    const gave = S.giving.filter(g => g.member === u.id).reduce((t, g) => t + Number(g.amount || 0), 0);
    const up = S.events.filter(e => e.date >= today).sort(byDate).slice(0, 3);
    return `${hero(u)}<div class="grid">
    <div class="stat"><b data-n="${mine.length}">0</b><span>Services attended</span></div>
    <div class="stat"><b data-n="${pct}">0</b><span>% attendance</span></div>
    <div class="stat"><b>${money(gave)}</b><span>Your giving</span></div></div>
    <div class="card"><h2>Your details</h2><form id="f-me">
    <label>Full name<input name="name" value="${esc(u.name)}" required></label>
    <label>Phone<input name="phone" type="tel" value="${esc(u.phone)}"></label>
    <label>Course and level<input name="course" value="${esc(u.course)}"></label>
    <button class="btn">Save changes</button></form>
    <div class="row"><div class="grow"><small>Email</small>${esc(u.email)}</div><div class="grow"><small>Zone</small>${esc(u.zone || 'Not set')}</div><div class="grow"><small>Department</small>${esc(u.group || 'Not set')}</div></div>
    <p class="note">Your zone and department are set by your executives.</p></div>
    ${annc(u)}${pwCard()}<div class="card"><h2>Coming up</h2>${up.length ? up.map(e => `<div class="row"><div class="grow"><b>${esc(e.title)}</b><small>${fmt(e.date)}${e.place ? ' at ' + esc(e.place) : ''}</small></div></div>`).join('') : '<p class="empty">No upcoming events yet.</p>'}</div>`;
}
function overview(u) {
    const sv = [...S.services].sort(byDate), last = sv[sv.length - 1], recent = sv.slice(-8), max = Math.max(1, ...recent.map(s => cnt(s, u)));
    const month = today.slice(0, 7), gm = S.giving.filter(g => (g.date || '').startsWith(month)).reduce((t, g) => t + Number(g.amount || 0), 0);
    const up = S.events.filter(e => e.date >= today).sort(byDate), mg = managed(u);
    const zones = isSuper(u) ? `<div class="card"><h2>Members by zone</h2>${ZONES.map(z => { const n = S.members.filter(m => m.zone === z).length; return `<div class="row"><span class="grow">${z}</span><div class="track"><i style="width:${S.members.length ? Math.round(n / S.members.length * 100) : 0}%"></i></div><b>${n}</b></div>` }).join('')}</div>` : '';
    return `${hero(u)}<div class="grid">
    <div class="stat"><b data-n="${last ? cnt(last, u) : 0}">0</b><span>${last ? esc(last.type) + ', ' + short(last.date) : 'No attendance yet'}</span></div>
    <div class="stat"><b data-n="${mg.length}">0</b><span>${isSuper(u) ? 'Members on the platform' : 'Members you manage'}</span></div>
    ${isSuper(u) ? `<div class="stat"><b>${money(gm)}</b><span>Given this month</span></div>` : ''}
    <div class="stat"><b data-n="${up.length}">0</b><span>Upcoming events</span></div></div>
    <div class="card"><h2>Attendance, last ${recent.length || 8} services</h2>${recent.length ? `<div class="bars">${recent.map(s => { const n = cnt(s, u); return `<div class="bar"><em>${n}</em><i style="height:${Math.round(n / max * 100)}%"></i>${short(s.date)}</div>` }).join('')}</div>` : '<p class="empty">Open a register on the Attendance tab to start the chart.</p>'}</div>
    ${zones}`;
}
function members(u) {
    const list = managed(u).filter(m => (m.name + ' ' + (m.group || '') + ' ' + (m.zone || '')).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
    const m = editing && S.members.find(x => x.id === editing);
    const edit = m && canEdit(u, m) ? `<div class="card"><h2>Edit ${esc(m.name)}</h2><form id="f-edit">
    <label>Full name<input name="name" value="${esc(m.name)}" required></label>
    <label>Phone<input name="phone" value="${esc(m.phone)}"></label>
    <label>Course and level<input name="course" value="${esc(m.course)}"></label>
    <label>Zone<select name="zone">${opts(ZONES, m.zone, 'No zone')}</select></label>
    <label>Department<select name="group">${opts(DEPTS, m.group, 'No department')}</select></label>
    ${isSuper(u) ? `<label>Role<select name="role">${Object.entries(ROLES).map(([k, l]) => `<option value="${k}"${k === m.role ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
    <button class="btn">Save</button><button type="button" class="btn ghost" data-cancel>Cancel</button></form></div>`: '';
    return `${issuedCard()}${edit}<div class="card"><h2>Add a member</h2><form id="f-member">
    <label>Full name<input name="name" required></label>
    <label>Phone<input name="phone" type="tel"></label>
    <label>Course and level<input name="course"></label>
    <label>Zone<select name="zone">${opts(ZONES, u.zone, 'No zone')}</select></label>
    <label>Department<select name="group">${opts(DEPTS, u.group, 'No department')}</select></label>
    <button class="btn">Add member</button></form></div>
    <div class="card"><h2>${list.length} members</h2><label>Search<input id="q" value="${esc(q)}" placeholder="Name, zone or department"></label>
    ${list.length ? list.map(x => `<div class="row"><div class="grow"><b>${esc(x.name)}</b><small>${[x.zone, x.phone, x.course].filter(Boolean).map(esc).join(' · ')}</small></div>${x.group ? `<span class="chip">${esc(x.group)}</span>` : ''}${x.role !== 'member' ? `<span class="badge ${x.role[0]}">${ROLES[x.role]}</span>` : ''}${x.id !== u.id ? `<button class="x" data-edit="${esc(x.id)}">Edit</button><button class="x" data-reset="${esc(x.id)}">Reset password</button><button class="x" data-del="members" data-id="${esc(x.id)}" aria-label="Remove ${esc(x.name)}">Remove</button>` : ''}</div>`).join('') : '<p class="empty">No members in your scope yet.</p>'}</div>`;
}
function attendance(u) {
    const key = regKey(), svc = S.services.find(s => s.id === key), present = (svc && svc.present) || [], list = vis(u).sort((a, b) => a.name.localeCompare(b.name));
    const hist = [...S.services].sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 10);
    return `<div class="card"><h2>Register</h2><form id="f-reg">
    <label>Date<input type="date" name="date" value="${esc(reg.date)}" required></label>
    <label>Meeting<select name="type">${opts(TYPES, reg.type)}</select></label>${svc ? '' : '<button class="btn">Start this register</button>'}</form></div>
    ${svc ? `<div class="card"><h2>${list.filter(m => present.includes(m.id)).length} of ${list.length} present</h2>${list.map(m => `<label class="check"><input type="checkbox" data-pres="${esc(m.id)}"${present.includes(m.id) ? ' checked' : ''}><span>${esc(m.name)}</span></label>`).join('')}</div>` : ''}
    <div class="card"><h2>Recent registers</h2>${hist.length ? hist.map(s => `<div class="row"><div class="grow"><b>${esc(s.type)}</b><small>${fmt(s.date)}</small></div><span class="gold">${cnt(s, u)}</span>${isSuper(u) ? `<button class="x" data-del="services" data-id="${esc(s.id)}">Delete</button>` : ''}</div>`).join('') : '<p class="empty">No registers yet.</p>'}</div>`;
}
function giving(u) {
    const list = [...S.giving].sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 40), tot = {};
    S.giving.forEach(g => { tot[g.category] = (tot[g.category] || 0) + Number(g.amount || 0) });
    return `<div class="card"><h2>Record a gift</h2><form id="f-give">
    <label>Date<input type="date" name="date" value="${today}" required></label>
    <label>Giver<select name="member"><option value="">Anonymous</option>${[...S.members].sort((a, b) => a.name.localeCompare(b.name)).map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></label>
    <label>Category<select name="category">${opts(CATS)}</select></label>
    <label>Amount<input type="number" name="amount" min="0" step="0.01" required></label><button class="btn">Save gift</button></form></div>
    <div class="grid">${CATS.map(c => `<div class="stat"><b>${money(tot[c])}</b><span>${c}, all time</span></div>`).join('')}</div>
    <div class="card"><h2>Latest gifts</h2>${list.length ? list.map(g => `<div class="row"><div class="grow"><b>${money(g.amount)}</b><small>${esc(g.category)} · ${g.member ? esc(nameOf(g.member)) : 'Anonymous'} · ${fmt(g.date)}</small></div><button class="x" data-del="giving" data-id="${esc(g.id)}">Delete</button></div>`).join('') : '<p class="empty">No gifts recorded yet.</p>'}</div>`;
}
function events(u) {
    const list = [...S.events].sort(byDate), staff = u.role !== 'member';
    return `${staff ? `<div class="card"><h2>Add an event</h2><form id="f-event"><label>Title<input name="title" required></label><label>Date<input type="date" name="date" required></label><label>Place<input name="place"></label><button class="btn">Add event</button></form></div>` : ''}
    <div class="card"><h2>Events</h2>${list.length ? list.map(e => `<div class="row"><div class="grow"><b>${esc(e.title)}</b><small>${fmt(e.date)}${e.place ? ' at ' + esc(e.place) : ''}</small></div>${e.date < today ? '<span class="chip">Past</span>' : ''}${staff ? `<button class="x" data-del="events" data-id="${esc(e.id)}">Delete</button>` : ''}</div>`).join('') : '<p class="empty">No events yet.</p>'}</div>`;
}
function notices(u) {
    const sup = isSuper(u), list = S.notices.filter(n => n.to === (sup ? 'log' : u.id)).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 50);
    return `${issuedCard()}<div class="card"><h2>${sup ? 'Activity log' : 'Alerts'}</h2>${!sup && list.some(n => !n.read) ? '<button class="btn ghost" data-readall>Mark all as read</button>' : ''}
    ${list.length ? list.map(n => `<div class="row${!sup && !n.read ? ' unread' : ''}"><div class="grow">${esc(n.text)}<small>${new Date(n.date).toLocaleString()}</small></div>${resetBtn(u, n)}</div>`).join('') : `<p class="empty">${sup ? 'Changes you make to members will be logged here.' : 'You will be told here when a super admin manages a member in your zone or department.'}</p>`}</div>`;
}
const VIEWS = { me: profile, messages: msgs, overview, members, attendance, giving, events, notices };

function authView() {
    if (mode === 'forgot') return forgotView();
    const su = mode === 'signup';
    return `<div class="auth"><div class="blobs"><i></i><i></i><i></i></div><div class="auth-card">
    <p class="eyebrow">⛪ Campus Church</p><h1>${su ? 'Create your account' : 'Welcome back'}</h1>
    <p class="note">${su ? 'Join your zone and department.' : 'Log in to see your profile, your zone and what is coming up.'}</p>
    <div class="seg"><button data-auth="login" aria-selected="${!su}">Log in</button><button data-auth="signup" aria-selected="${su}">Sign up</button></div>
    <form id="${su ? 'f-signup' : 'f-login'}">
    ${su ? '<label class="full">Full name<input name="name" required autocomplete="name"></label>' : ''}
    <label class="full">Email<input name="email" type="email" required autocomplete="email"></label>
    ${su ? `<label>Phone<input name="phone" type="tel"></label><label>Course and level<input name="course"></label><label>Zone<select name="zone">${opts(ZONES, '', 'Choose zone')}</select></label><label>Department<select name="group">${opts(DEPTS, '', 'Choose department')}</select></label>` : ''}
    <label class="full">Password<input name="password" type="password" required minlength="6" autocomplete="${su ? 'new-password' : 'current-password'}"></label>
    <p class="err full" role="alert">${esc(err)}</p><button class="btn full">${su ? 'Create account' : 'Log in'}</button></form>${su ? '' : '<button type="button" class="x" data-auth="forgot">Forgot your password?</button>'}
    ${S.members.some(m => m.email) ? '' : '<p class="note">No accounts exist yet, so the first sign-up becomes the Super admin.</p>'}
    <p class="note">Records are ${where}.</p></div></div>`;
}
function shell(u) {
    const tabs = TABS.filter(t => t[2].includes(u.role[0]));
    if (!tab || !tabs.some(t => t[0] === tab)) tab = u.role === 'member' ? 'me' : 'overview';
    const unread = S.notices.filter(n => n.to === u.id && !n.read).length;
    return `<div class="wrap"><div class="top"><b class="brand">⛪ Campus Church</b><div class="user"><span class="av">${esc((u.name[0] || '?').toUpperCase())}</span><span class="who"><b>${esc(u.name)}</b><span class="badge ${u.role[0]}">${ROLES[u.role]}</span></span><button class="btn ghost" data-logout>Log out</button></div></div>
    <nav role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" data-tab="${k}">${k === 'notices' && isSuper(u) ? 'Activity' : l}${k === 'notices' && isAdmin(u) && unread ? `<span class="dot">${unread}</span>` : ''}</button>`).join('')}</nav>
    <main class="${anim ? 'enter' : ''}">${VIEWS[tab](u)}</main><p class="note">Records are ${where}.</p></div>`;
}
function countUp() {
    document.querySelectorAll('[data-n]').forEach(el => {
        const n = +el.dataset.n; if (!anim || n === 0) { el.textContent = n; return }
        const t0 = performance.now(); (function f(t) { const p = Math.min(1, (t - t0) / 700); el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f) })(t0);
    });
}
const kf = el => el.form ? el.form.id + '.' + el.name : el.id;
function render() {
    const app = document.getElementById('app'), a = document.activeElement;
    const keep = a && a !== document.body ? { k: kf(a), pos: a.selectionStart } : null, vals = {};
    app.querySelectorAll('input[name],select[name]').forEach(el => { if (el.type !== 'checkbox') vals[kf(el)] = el.value });
    anim = fresh; fresh = false;
    const u = me();
    if (!ready || (sid && !u && db && Date.now() - bootAt < 5000)) { app.innerHTML = '<div class="boot"><span class="spin"></span></div>'; return }
    if (sid && !u) { sid = null; try { localStorage.removeItem('cms_sid') } catch (e) { } }
    app.innerHTML = u ? (u.mustChange ? newPwView(u) : shell(u)) : authView();
    app.querySelectorAll('input[name],select[name]').forEach(el => { const k = kf(el); if (k in vals && el.type !== 'checkbox' && !k.startsWith('f-reg.') && !k.startsWith('f-msg.')) el.value = vals[k] });
    if (keep) { const el = [...app.querySelectorAll('input,select')].find(x => kf(x) === keep.k); if (el) { el.focus(); try { el.setSelectionRange(keep.pos, keep.pos) } catch (e) { } } }
    countUp();
}
const go = () => { fresh = true; render() };
function setSession(id) { sid = id; tab = null; err = ''; try { localStorage.setItem('cms_sid', id) } catch (e) { } go() }

/* events */
document.addEventListener('click', e => {
    const g = s => e.target.closest(s);
    if (g('[data-tab]')) { tab = g('[data-tab]').dataset.tab; editing = null; return go() }
    if (g('[data-auth]')) { mode = g('[data-auth]').dataset.auth; err = ''; info = ''; return go() }
    if (g('[data-logout]')) { sid = null; tab = null; try { localStorage.removeItem('cms_sid') } catch (x) { } return go() }
    if (g('[data-edit]')) { editing = g('[data-edit]').dataset.edit; return go() }
    if (g('[data-cancel]')) { editing = null; return render() }
    if (g('[data-readall]')) { const u = me(); S.notices.filter(n => n.to === u.id && !n.read).forEach(n => { const { id, ...r } = n; put('notices', { ...r, read: true }, id).catch(fail) }); return }
    const u0 = me();
    if (g('[data-reset]')) { const m = rc(g('[data-reset]').dataset.reset); if (m && u0 && m.id !== u0.id && canEdit(u0, m) && confirm('Issue a temporary password for ' + m.name + '? Their old password will stop working.')) issue(u0, m).catch(fail); return }
    if (g('[data-dismiss]')) { issued = null; return render() }
    if (g('[data-copy]')) { try { navigator.clipboard.writeText(issued.pw); toast('Copied') } catch (x) { toast('Select the code and copy it by hand.') } return }
    const sd = g('[data-send]');
    if (sd && u0) {
        const k = sd.dataset.send;
        if (k === 'reset-mail' && issued) return openUrl(`mailto:${issued.email || ''}?subject=${encodeURIComponent('Your temporary password')}&body=${encodeURIComponent('Your temporary password is ' + issued.pw + '. You will choose a new one when you log in.')}`);
        if (k === 'reset-sms' && issued) return openUrl(`sms:${digits(issued.phone)}?body=${encodeURIComponent('Your temporary church app password is ' + issued.pw + '. You will choose a new one at login.')}`);
        if (!msg.body.trim()) return toast('Write a message first.');
        const r = recips(u0);
        if (k === 'mail') return openUrl(`mailto:?bcc=${r.map(m => m.email).filter(Boolean).join(',')}&subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.body)}`);
        if (k === 'sms') return openUrl(`sms:${r.map(m => digits(m.phone)).filter(Boolean).join(',')}?body=${encodeURIComponent(text())}`);
    }
    const pm = g('[data-wa],[data-sms],[data-mail]');
    if (pm) {
        const m = rc(pm.dataset.wa || pm.dataset.sms || pm.dataset.mail); if (!m) return;
        if (!msg.body.trim()) return toast('Write a message first.');
        if (pm.dataset.wa) return openUrl(`https://wa.me/${digits(m.phone)}?text=${encodeURIComponent(text())}`);
        if (pm.dataset.sms) return openUrl(`sms:${digits(m.phone)}?body=${encodeURIComponent(text())}`);
        return openUrl(`mailto:${m.email}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.body)}`);
    }
    const d = g('[data-del]'); if (!d) return;
    const u = me(), c = d.dataset.del, id = d.dataset.id;
    if (c === 'members') {
        const m = S.members.find(x => x.id === id);
        if (!m || m.id === u.id || !canEdit(u, m)) return toast('You can’t remove this member.');
        if (!confirm('Remove ' + m.name + '? This cannot be undone.')) return;
        del(c, id).then(() => { if (isSuper(u)) notify(u, m, null, 'removed') }).catch(fail); return;
    }
    if (u.role === 'member') return;
    if (confirm('Remove this record? This cannot be undone.')) del(c, id).catch(fail);
});
document.addEventListener('input', e => { const t = e.target; if (t.id === 'q') { q = t.value; render() } else if (t.form && t.form.id === 'f-msg' && t.name !== 'aud') msg[t.name] = t.value });
document.addEventListener('change', e => {
    const el = e.target;
    if (el.form && el.form.id === 'f-msg' && el.name === 'aud') { msg.aud = el.value; return render() }
    if (el.dataset && el.dataset.pres) {
        const svc = S.services.find(s => s.id === regKey()); if (!svc) return;
        const set = new Set(svc.present || []); el.checked ? set.add(el.dataset.pres) : set.delete(el.dataset.pres);
        put('services', { date: svc.date, type: svc.type, present: [...set] }, svc.id).catch(fail); return;
    }
    if (el.form && el.form.id === 'f-reg') { reg.date = el.form.date.value || today; reg.type = el.form.type.value; render() }
});
document.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, v = Object.fromEntries(new FormData(f)), u = me();
    try {
        if (f.id === 'f-signup') {
            const email = v.email.trim().toLowerCase();
            if (S.members.some(m => m.email === email)) { err = 'That email already has an account. Try logging in.'; return render() }
            const salt = hex(crypto.getRandomValues(new Uint8Array(16))), id = 'u-' + slug(email);
            const role = S.members.some(m => m.email) ? 'member' : 'super';
            await put('members', { name: v.name.trim(), email, phone: v.phone, course: v.course, zone: v.zone, group: v.group, role, salt, hash: await hashPw(v.password, salt), joined: today }, id);
            return setSession(id);
        }
        if (f.id === 'f-login') {
            const email = v.email.trim().toLowerCase(), m = S.members.find(x => x.email === email);
            if (!m || await hashPw(v.password, m.salt) !== m.hash) { err = 'Wrong email or password.'; return render() }
            return setSession(m.id);
        }
        if (f.id === 'f-forgot') {
            const email = v.email.trim().toLowerCase(), m = S.members.find(x => x.email === email);
            if (m) {
                const base = { by: m.id, member: m.id, date: new Date().toISOString(), read: false, reset: true, text: `${m.name} asked for a password reset` };
                put('notices', { ...base, to: 'log' }); S.members.filter(a => isAdmin(a) && covers(a, m)).forEach(a => put('notices', { ...base, to: a.id }))
            }
            info = 'If that email has an account, your executives have been told. Ask one of them for your temporary password.'; return render();
        }
        if (!u) return;
        if (f.id === 'f-newpw') {
            if (v.pw !== v.pw2) { err = 'The two passwords do not match.'; return render() }
            const salt = hex(crypto.getRandomValues(new Uint8Array(16))), { id, ...r } = u;
            await put('members', { ...r, salt, hash: await hashPw(v.pw, salt), mustChange: false }, u.id); err = ''; toast('Password updated'); return go();
        }
        if (f.id === 'f-pw') {
            if (await hashPw(v.cur, u.salt) !== u.hash) return toast('Your current password is wrong.');
            const salt = hex(crypto.getRandomValues(new Uint8Array(16))), { id, ...r } = u;
            await put('members', { ...r, salt, hash: await hashPw(v.pw, salt), mustChange: false }, u.id); f.reset(); toast('Password updated'); return;
        }
        if (f.id === 'f-msg') {
            msg.subject = v.subject; msg.body = v.body; const r = recips(u);
            if (!r.length) return toast('No recipients in this audience.');
            await put('messages', { by: u.id, byName: u.name, subject: v.subject.trim(), body: v.body.trim(), date: new Date().toISOString(), to: r.map(m => m.id) });
            msg.subject = ''; msg.body = ''; render(); toast('Announcement posted to ' + r.length + ' members'); return;
        }
        if (f.id === 'f-me') { const { id, ...r } = u; await put('members', { ...r, name: v.name.trim(), phone: v.phone, course: v.course }, u.id); toast('Details saved'); return }
        if (f.id === 'f-member') {
            let zone = v.zone, group = v.group;
            if (isAdmin(u) && !((u.zone && zone === u.zone) || (u.group && group === u.group))) { zone = u.zone || ''; group = group || u.group || '' }
            await put('members', { name: v.name.trim(), phone: v.phone, course: v.course, zone, group, role: 'member' }); f.reset(); return;
        }
        if (f.id === 'f-edit') {
            const m = S.members.find(x => x.id === editing); if (!m || !canEdit(u, m)) return;
            const { id, ...r } = m, nv = { ...r, name: v.name.trim(), phone: v.phone, course: v.course, zone: v.zone, group: v.group };
            let what = 'updated the details of';
            if (isSuper(u) && v.role && v.role !== m.role) {
                if (m.role === 'super' && S.members.filter(x => x.role === 'super').length < 2) return toast('There must be at least one Super admin.');
                nv.role = v.role; what = `changed the role to ${ROLES[v.role]} for`;
            } else if (v.zone !== (m.zone || '') || v.group !== (m.group || '')) what = 'changed the zone or department of';
            await put('members', nv, m.id);
            if (isSuper(u)) notify(u, m, { ...nv, id: m.id }, what);
            editing = null; render(); toast('Member updated'); return;
        }
        if (f.id === 'f-reg') { await put('services', { date: reg.date, type: reg.type, present: [] }, regKey()); return }
        if (f.id === 'f-give') { await put('giving', { date: v.date, member: v.member, category: v.category, amount: Number(v.amount) }); f.reset(); return }
        if (f.id === 'f-event') { await put('events', { title: v.title.trim(), date: v.date, place: v.place }); f.reset() }
    } catch (x) { fail(x) }
});

/* password reset and messages */
const DIAL = '233';
const msg = { aud: 'all', subject: '', body: '' };
let issued = null, info = '';
const rc = id => S.members.find(x => x.id === id);
const text = () => (msg.subject ? msg.subject + '\n\n' : '') + msg.body;
const digits = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = DIAL + d.slice(1); return d };
function openUrl(h) { const a = document.createElement('a'); a.href = h; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove() }
const tempPw = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
async function issue(u, m) {
    const pw = tempPw(), salt = hex(crypto.getRandomValues(new Uint8Array(16))), { id, ...r } = m;
    await put('members', { ...r, salt, hash: await hashPw(pw, salt), mustChange: true }, m.id);
    issued = { name: m.name, pw, email: m.email, phone: m.phone };
    if (isSuper(u)) notify(u, m, m, 'reset the password of');
    render();
}
const resetBtn = (u, n) => { const m = n.reset && rc(n.member); return m && m.id !== u.id && canEdit(u, m) ? `<button class="x" data-reset="${esc(m.id)}">Issue temporary password</button>` : '' };
const issuedCard = () => issued ? `<div class="card issued"><h2>Temporary password for ${esc(issued.name)}</h2><p><code>${esc(issued.pw)}</code></p><p class="note">Share it privately. They must choose a new password at their next login, and this code will not be shown again.</p><button class="btn" data-copy>Copy</button> <button class="btn ghost" data-send="reset-mail">Email it</button> <button class="btn ghost" data-send="reset-sms">Text it</button> <button class="btn ghost" data-dismiss>Done</button></div>` : '';
const authFrame = (h, body) => `<div class="auth"><div class="blobs"><i></i><i></i><i></i></div><div class="auth-card"><p class="eyebrow">⛪ Campus Church</p><h1>${h}</h1>${body}</div></div>`;
const forgotView = () => authFrame('Reset your password', `<p class="note">Enter your email. Your zone or department executive will be told and can give you a temporary password.</p><form id="f-forgot"><label class="full">Email<input name="email" type="email" required></label><p class="note full" role="status">${esc(info)}</p><button class="btn full">Ask for a reset</button></form><button type="button" class="x" data-auth="login">Back to log in</button>`);
const newPwView = u => authFrame('Choose a new password', `<p class="note">Hi ${esc(u.name.split(' ')[0])}, your password was reset. Set your own to continue.</p><form id="f-newpw"><label class="full">New password<input name="pw" type="password" minlength="6" required autocomplete="new-password"></label><label class="full">Confirm password<input name="pw2" type="password" minlength="6" required autocomplete="new-password"></label><p class="err full" role="alert">${esc(err)}</p><button class="btn full">Save and continue</button></form><button type="button" class="x" data-logout>Log out</button>`);
const pwCard = () => `<div class="card"><h2>Change password</h2><form id="f-pw"><label>Current password<input name="cur" type="password" required autocomplete="current-password"></label><label>New password<input name="pw" type="password" minlength="6" required autocomplete="new-password"></label><button class="btn">Update password</button></form></div>`;
const annc = u => { const l = S.messages.filter(m => (m.to || []).includes(u.id)).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 5); return l.length ? `<div class="card"><h2>Announcements</h2>${l.map(m => `<div class="row"><div class="grow"><b>${esc(m.subject)}</b><small>${esc(m.byName)} · ${new Date(m.date).toLocaleDateString()}</small><div class="msgbody">${esc(m.body)}</div></div></div>`).join('')}</div>` : '' };
const baseRec = u => (isSuper(u) ? S.members : managed(u)).filter(m => m.id !== u.id);
const recips = u => { const b = baseRec(u), a = msg.aud; return a === 'all' ? b : a[0] === 'z' ? b.filter(m => m.zone === a.slice(2)) : b.filter(m => m.group === a.slice(2)) };
function msgs(u) {
    const b = baseRec(u), zs = [...new Set(b.map(m => m.zone).filter(Boolean))], ds = [...new Set(b.map(m => m.group).filter(Boolean))], r = recips(u);
    const o = (v, l) => `<option value="${esc(v)}"${msg.aud === v ? ' selected' : ''}>${esc(l)}</option>`;
    const sent = S.messages.filter(m => m.by === u.id).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 5);
    return `<div class="card"><h2>New message</h2><form id="f-msg">
    <label class="full">To<select name="aud">${o('all', 'Everyone I manage (' + b.length + ')')}${zs.map(z => o('z:' + z, z)).join('')}${ds.map(d => o('d:' + d, d)).join('')}</select></label>
    <label class="full">Subject<input name="subject" value="${esc(msg.subject)}" required></label>
    <label class="full">Message<textarea name="body" rows="4" required>${esc(msg.body)}</textarea></label>
    <button class="btn">Post announcement in the app</button>
    <button type="button" class="btn ghost" data-send="mail">Email all ${r.length}</button>
    <button type="button" class="btn ghost" data-send="sms">Text all ${r.length}</button></form>
    <p class="note">Announcements show on each member’s profile. Email, text and WhatsApp open your own apps with the recipients filled in; this page cannot send them by itself.</p></div>
    <div class="card"><h2>${r.length} recipients</h2>${r.length ? r.map(m => `<div class="row"><div class="grow"><b>${esc(m.name)}</b><small>${esc(m.phone || 'No phone')} · ${esc(m.email || 'No email')}</small></div>${m.phone ? `<button class="x" data-wa="${esc(m.id)}">WhatsApp</button><button class="x" data-sms="${esc(m.id)}">Text</button>` : ''}${m.email ? `<button class="x" data-mail="${esc(m.id)}">Email</button>` : ''}</div>`).join('') : '<p class="empty">No one in this audience yet.</p>'}</div>
    ${sent.length ? `<div class="card"><h2>Your recent announcements</h2>${sent.map(m => `<div class="row"><div class="grow"><b>${esc(m.subject)}</b><small>${(m.to || []).length} members · ${new Date(m.date).toLocaleDateString()}</small></div></div>`).join('')}</div>` : ''}`;
}

/* start */
function watch() {
    const mine = S.notices.filter(n => n.to === sid && !n.read);
    if (seenInit) mine.filter(n => !seen.has(n.id)).forEach(n => toast('🔔 ' + n.text));
    mine.forEach(n => seen.add(n.id)); seenInit = true;
}
(async () => {
    render();
    try { if (window.claude) db = await claude.use('db') } catch (e) { db = null }
    if (db) {
        where = 'shared with everyone who has access';
        setTimeout(() => { if (!ready) { ready = true; render() } }, 6000);
        Object.keys(S).forEach(c => db.collection(c).onSnapshot(s => {
            S[c] = (s.docs || []).map(d => c === 'members' ? { role: 'member', ...d.data(), id: d.id } : { ...d.data(), id: d.id });
            if (c === 'members') ready = true;
            if (c === 'notices') watch();
            render();
        }, x => { ready = true; where = 'unavailable (' + (x && x.message || 'error') + ')'; render() }));
    } else {
        Object.keys(S).forEach(c => { try { S[c] = JSON.parse(localStorage.getItem('cms_' + c)) || [] } catch (x) { S[c] = [] } });
        S.members.forEach(m => { m.role = m.role || 'member' });
        ready = true; seenInit = true; render();
    }
})();
