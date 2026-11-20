import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type Director = {
  id?: number;
  role: string;
  name: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
};

type Organization = {
  id: number;
  name: string;
  rut?: string | null;
  valid_until?: string | null;
  email?: string | null;
  status?: 'active' | 'inactive';
  directors: Director[];
};

const roleOptions = ['Presidente/a', 'Secretario/a', 'Tesorero/a', 'Vicepresidente/a', 'Director/a 1°', 'Otro cargo'];
const emptyDirector = (): Director => ({ role: 'Presidente/a', name: '', address: '', email: '', phone: '' });

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(' ') : body.message || 'Ocurrió un error.');
  return body;
}

function displayDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export default function App() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [adminFilter, setAdminFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loginOpen, setLoginOpen] = useState(false);
  const [formRecord, setFormRecord] = useState<Organization | 'new' | null>(null);
  const [directors, setDirectors] = useState<Director[]>([]);
  const [notification, setNotification] = useState('');
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function notify(message: string) {
    setNotification(message);
    clearTimeout(notificationTimer.current);
    notificationTimer.current = setTimeout(() => setNotification(''), 4000);
  }

  async function load() {
    setError('');
    try {
      const publicRows = await request<Organization[]>('/organizations');
      setOrganizations(publicRows);
      try {
        const user = await request<{ username: string }>('/auth/me');
        const allRows = await request<Organization[]>('/organizations/admin');
        setUsername(user.username);
        setIsAdmin(true);
        setOrganizations(allRows);
      } catch {
        setUsername('');
        setIsAdmin(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el directorio.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visibleRows = useMemo(() => organizations.filter((organization) => {
    const text = `${organization.name} ${organization.directors.map((director) => director.name).join(' ')}`.toLocaleLowerCase('es');
    return text.includes(search.toLocaleLowerCase('es')) && (adminFilter === 'all' || organization.status === adminFilter);
  }), [organizations, search, isAdmin, adminFilter]);
  const totalOrganizations = isAdmin
    ? organizations.filter((organization) => organization.status === 'active').length + organizations.filter((organization) => organization.status === 'inactive').length
    : organizations.length;

  function openEditor(record: Organization | 'new') {
    setError('');
    setDirectors(record === 'new' ? [emptyDirector(), { ...emptyDirector(), role: 'Secretario/a' }, { ...emptyDirector(), role: 'Tesorero/a' }] : record.directors.map((director) => ({ ...director })));
    setFormRecord(record);
  }

  function updateDirector(index: number, field: keyof Director, value: string) {
    setDirectors((rows) => rows.map((director, i) => i === index ? { ...director, [field]: value } : director));
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    try {
      await request('/auth/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
      setLoginOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
    }
  }

  async function logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
      setIsAdmin(false);
      setUsername('');
      setAdminFilter('all');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar la sesión.');
    }
  }

  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formRecord) return;
    setError('');
    const form = new FormData(event.currentTarget);
    const data = {
      name: form.get('name'), rut: form.get('rut'), validUntil: form.get('validUntil'),
      email: form.get('email'), status: form.get('status'),
      directors: directors.filter((director) => director.name.trim()).map(({ role, name, address, email, phone }) => ({ role, name, address, email, phone })),
    };
    try {
      await request(formRecord === 'new' ? '/organizations' : `/organizations/${formRecord.id}`, {
        method: formRecord === 'new' ? 'POST' : 'PUT', body: JSON.stringify(data),
      });
      notify(formRecord === 'new' ? 'Organización creada correctamente.' : 'Cambios guardados correctamente.');
      setFormRecord(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la organización.');
    }
  }

  async function removeOrganization(organization: Organization) {
    if (!window.confirm(`¿Eliminar “${organization.name}”? Esta acción no se puede deshacer.`)) return;
    try {
      await request(`/organizations/${organization.id}`, { method: 'DELETE' });
      notify(`“${organization.name}” fue eliminada.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la organización.');
    }
  }

  return (
    <div className="app-shell" data-ui>
      {notification && <div className="success-notice" role="status">{notification}</div>}
      <header className="topbar">
        <a className="brand" href="/" aria-label="Oficina Municipal de la Juventud, inicio">
          <span className="brand-logo-wrap">
            <img className="brand-logo" src="/omjd-logo.png" alt="Logo de la Oficina Municipal de la Juventud" />
            <img className="brand-logo-white" src="/omjd-logo.png" alt="" aria-hidden="true" />
          </span>
          <span className="brand-copy"><strong>REGISTRO COMUNAL</strong><small>Organizaciones juveniles · Caldera</small></span>
        </a>
      </header>

      <main className="main-content">
        <div className="title-row">
          <div>
            <h1>REGISTRO COMUNAL DE ORGANIZACIONES JUVENILES</h1>
          </div>
          <div className="title-actions">
            {isAdmin && <span className="session-label">Sesión: {username}</span>}
            {isAdmin ? <><button className="primary-button" onClick={() => openEditor('new')}><span aria-hidden="true">＋</span> Nueva organización</button><button className="quiet-button admin-access" onClick={logout}>Cerrar sesión</button></>
              : <button className="quiet-button admin-access" onClick={() => { setError(''); setLoginOpen(true); }}>Acceso administrador</button>}
          </div>
        </div>

        {!loading && !error && <div className="overview-stats" aria-label="Resumen del directorio">
          <div><span>Total de organizaciones juveniles</span><strong>{totalOrganizations}</strong></div>
          <div><span>Total de organizaciones activas</span><strong>{organizations.filter((organization) => organization.status === 'active').length}</strong></div>
          <div><span>Comuna</span><strong>Caldera</strong></div>
        </div>}

        <section className="directory-section" aria-labelledby="directory-title">
          <div className="section-heading">
            <div><h2 id="directory-title">Organizaciones registradas</h2>
              <p>{isAdmin ? 'Los antecedentes personales solo son visibles en esta sesión.' : 'Nombre de la organización, directorio, correo electrónico.'}</p></div>
          </div>

          <div className="list-controls">
            <div className="tabs" role="group" aria-label="Filtrar por estado">
              {(['all', 'active', 'inactive'] as const).map((filter) => <button key={filter} className={adminFilter === filter ? 'tab selected' : 'tab'} onClick={() => setAdminFilter(filter)}>
                {filter === 'all' ? 'Todas' : filter === 'active' ? 'Activas' : 'Inactivas'}
              </button>)}
            </div>
            <label className="search-box"><span aria-hidden="true" className="search-icon"><svg viewBox="0 0 20 20" focusable="false"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg></span><span className="sr-only">Buscar organizaciones</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar organización o integrante" />
              {search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')}>×</button>}
            </label>
          </div>

          {error && !loginOpen && !formRecord && <div className="notice" role="alert">{error}</div>}
          {loading ? <p className="empty-state">Cargando organizaciones…</p> : visibleRows.length === 0 ?
            <div className="empty-state"><strong>{search ? 'No hay coincidencias.' : isAdmin && adminFilter !== 'all' ? 'No hay organizaciones en este estado.' : 'Aún no hay organizaciones registradas.'}</strong>
              <span>{isAdmin && !search ? 'Agrega una organización para comenzar el registro.' : 'Prueba con otro nombre o término de búsqueda.'}</span></div> :
            <div className="organization-list" aria-label="Listado de organizaciones">
              {visibleRows.map((organization, index) => {
                const shownDirectors = isAdmin ? organization.directors : organization.directors.filter((director) => roleOptions.slice(0, 3).includes(director.role));
                return <article className="organization-card" data-tone={index % 2} key={organization.id}>
                  <div className="organization-card-heading">
                    <div className="organization-card-title">
                      <h3>{organization.name}</h3>
                      {isAdmin && <span className="organization-rut">{organization.rut ? `RUT ${organization.rut}` : 'RUT —'}</span>}
                    </div>
                    <div className="organization-card-actions">
                      <span className={`status ${organization.status}`}>{organization.status === 'active' ? 'Activa' : 'Inactiva'}</span>
                      {isAdmin && <><button className="text-action" onClick={() => openEditor(organization)}>Editar</button>
                        <button className="text-action danger" onClick={() => void removeOrganization(organization)}>Eliminar</button></>}
                    </div>
                  </div>
                  <div className="organization-card-details">
                    <section className="card-directors" aria-label={`Directiva de ${organization.name}`}>
                      <h4>Directiva</h4>
                      {shownDirectors.length ? <ul className="organization-directors">{shownDirectors.map((director, index) => <li key={director.id ?? `${director.role}-${index}`}>
                        <h5>{director.name}</h5>
                        <dl className="director-facts">
                          <div><dt>Cargo</dt><dd>{director.role}</dd></div>
                          <div><dt>Correo</dt><dd>{director.email ? <a href={`mailto:${director.email}`}>{director.email}</a> : 'Sin correo registrado'}</dd></div>
                          {isAdmin && director.address && <div><dt>Domicilio</dt><dd>{director.address}</dd></div>}
                          {isAdmin && director.phone && <div><dt>Teléfono</dt><dd>{director.phone}</dd></div>}
                        </dl>
                      </li>)}</ul> : <p className="table-empty">Directiva pendiente de actualizar.</p>}
                    </section>
                    {(organization.email || isAdmin) && <div className="organization-card-meta">
                      <dl className="director-facts">
                        <div><dt>Correo de contacto</dt><dd>{organization.email ? <a href={`mailto:${organization.email}`}>{organization.email}</a> : 'Sin correo registrado'}</dd></div>
                        {isAdmin && <div><dt>Vigencia</dt><dd>{organization.valid_until ? displayDate(organization.valid_until) : 'Sin fecha registrada'}</dd></div>}
                      </dl>
                    </div>}
                  </div>
                </article>;
              })}
            </div>}
          <p className="list-footnote">{isAdmin ? `${visibleRows.length} de ${organizations.length} organizaciones` : 'Oficina Municipal de la Juventud · Municipalidad de Caldera'}</p>
        </section>
      </main>

      <footer className="footer"><span>Oficina Municipal de la Juventud y Diversidad · Municipalidad de Caldera</span></footer>

      {loginOpen && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setLoginOpen(false); }}>
        <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="login-title">
          <button className="close-button" onClick={() => setLoginOpen(false)} aria-label="Cerrar">×</button>
          <h2 id="login-title">Administración</h2><p>Ingresa con tu cuenta de administradora.</p>
          <form onSubmit={login}><label>Nombre de usuario<input name="username" autoComplete="username" required autoFocus /></label>
            <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
            {error && <div className="notice" role="alert">{error}</div>}
            <button className="primary-button full-width" type="submit">Iniciar sesión</button></form>
        </section>
      </div>}

      {formRecord && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setFormRecord(null); }}>
        <section className="dialog organization-dialog" role="dialog" aria-modal="true" aria-labelledby="form-title">
          <button className="close-button" onClick={() => setFormRecord(null)} aria-label="Cerrar">×</button>
          <h2 id="form-title">{formRecord === 'new' ? 'Nueva organización' : 'Editar organización'}</h2>
          <form onSubmit={saveOrganization}>
            <label>Nombre de la organización<input name="name" required minLength={2} maxLength={140} defaultValue={formRecord === 'new' ? '' : formRecord.name} /></label>
            <div className="form-grid"><label>RUT de la organización<input name="rut" maxLength={20} defaultValue={formRecord === 'new' ? '' : formRecord.rut ?? ''} /></label>
              <label>Vigencia hasta<input name="validUntil" type="date" defaultValue={formRecord === 'new' ? '' : formRecord.valid_until?.slice(0, 10) ?? ''} /></label>
              <label>Correo de la organización<input name="email" type="email" maxLength={254} defaultValue={formRecord === 'new' ? '' : formRecord.email ?? ''} /></label>
              <label>Estado<select name="status" defaultValue={formRecord === 'new' ? 'active' : formRecord.status ?? 'active'}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></label></div>
            <div className="director-form-heading"><div><h3>Directiva</h3><p>Domicilio y teléfono son privados y solo los verá administración.</p></div><button type="button" className="text-action" disabled={directors.length >= 12} onClick={() => setDirectors((rows) => [...rows, { ...emptyDirector(), role: 'Otro cargo' }])}>{directors.length >= 12 ? 'Máximo 12 integrantes' : '＋ Agregar integrante'}</button></div>
            <div className="director-fields">{directors.map((director, index) => <fieldset className="director-field" key={director.id ?? `new-${index}`}>
              <div className="director-field-heading"><strong>Integrante {index + 1}</strong><button type="button" className="text-action danger" onClick={() => setDirectors((rows) => rows.filter((_, i) => i !== index))}>Quitar</button></div>
              <div className="form-grid"><label>Cargo<select value={director.role} onChange={(e) => updateDirector(index, 'role', e.target.value)}>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select></label>
                <label>Nombre completo<input value={director.name} onChange={(e) => updateDirector(index, 'name', e.target.value)} maxLength={120} /></label>
                <label>Domicilio particular · privado<input value={director.address ?? ''} onChange={(e) => updateDirector(index, 'address', e.target.value)} maxLength={240} /></label>
                <label>Correo electrónico<input type="email" value={director.email ?? ''} onChange={(e) => updateDirector(index, 'email', e.target.value)} maxLength={254} /></label>
                <label>Teléfono · privado<input type="tel" value={director.phone ?? ''} onChange={(e) => updateDirector(index, 'phone', e.target.value)} maxLength={32} /></label></div>
            </fieldset>)}</div>
            {error && <div className="notice" role="alert">{error}</div>}
            <div className="dialog-actions"><button type="button" className="quiet-button" onClick={() => setFormRecord(null)}>Cancelar</button><button className="primary-button" type="submit">Guardar organización</button></div>
          </form>
        </section>
      </div>}
    </div>
  );
}
