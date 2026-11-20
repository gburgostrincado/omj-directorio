import { FormEvent, useEffect, useMemo, useState } from 'react';

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
  const [detailsRecord, setDetailsRecord] = useState<Organization | null>(null);
  const [formRecord, setFormRecord] = useState<Organization | 'new' | null>(null);
  const [directors, setDirectors] = useState<Director[]>([]);

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
    return text.includes(search.toLocaleLowerCase('es')) && (!isAdmin || adminFilter === 'all' || organization.status === adminFilter);
  }), [organizations, search, isAdmin, adminFilter]);

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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la organización.');
    }
  }

  return (
    <div className="app-shell" data-ui>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Oficina Municipal de la Juventud, inicio">
          <img className="brand-logo" src="/omjd-logo.png" alt="Logo de la Oficina Municipal de la Juventud" />
          <span className="brand-copy"><strong>Oficina Municipal de la Juventud</strong><small>Municipalidad de Caldera</small></span>
        </a>
        <div className="topbar-actions">
          {isAdmin ? <><span className="session-label">Sesión: {username}</span><button className="quiet-button" onClick={logout}>Cerrar sesión</button></>
            : <button className="quiet-button" onClick={() => { setError(''); setLoginOpen(true); }}>Acceso administrador</button>}
        </div>
      </header>

      <main className="main-content">
        <div className="title-row">
          <div>
            <h1>REGISTRO COMUNAL DE ORGANIZACIONES JUVENILES</h1>
            <p className="lead">{isAdmin ? 'Gestiona el registro y los antecedentes de cada organización.' : 'Organizaciones juveniles activas de la comuna de Caldera.'}</p>
          </div>
          {isAdmin && <button className="primary-button" onClick={() => openEditor('new')}><span aria-hidden="true">＋</span> Nueva organización</button>}
        </div>

        <section className="directory-section" aria-labelledby="directory-title">
          <div className="section-heading">
            <div><h2 id="directory-title">{isAdmin ? 'Listado de organizaciones' : 'Organizaciones registradas'}</h2>
              <p>{isAdmin ? 'Los antecedentes personales solo son visibles en esta sesión.' : 'Directiva y correo de contacto de cada organización.'}</p></div>
            <div className="count"><strong>{organizations.length}</strong><span>{isAdmin ? 'en registro' : 'organizaciones'}</span></div>
          </div>

          <div className="list-controls">
            {isAdmin && <div className="tabs" role="group" aria-label="Filtrar por estado">
              {(['all', 'active', 'inactive'] as const).map((filter) => <button key={filter} className={adminFilter === filter ? 'tab selected' : 'tab'} onClick={() => setAdminFilter(filter)}>
                {filter === 'all' ? 'Todas' : filter === 'active' ? 'Activas' : 'Inactivas'}
              </button>)}
            </div>}
            <label className="search-box"><span aria-hidden="true" className="search-icon"><svg viewBox="0 0 20 20" focusable="false"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg></span><span className="sr-only">Buscar organizaciones</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar organización o integrante" />
              {search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')}>×</button>}
            </label>
          </div>

          {error && !loginOpen && !formRecord && <div className="notice" role="alert">{error}</div>}
          {loading ? <p className="empty-state">Cargando organizaciones…</p> : visibleRows.length === 0 ?
            <div className="empty-state"><strong>{search ? 'No hay coincidencias.' : isAdmin && adminFilter !== 'all' ? 'No hay organizaciones en este estado.' : 'Aún no hay organizaciones registradas.'}</strong>
              <span>{isAdmin && !search ? 'Agrega una organización para comenzar el registro.' : 'Prueba con otro nombre o término de búsqueda.'}</span></div> :
            <div className="organization-table-wrap" role="region" aria-label="Listado de organizaciones" tabIndex={0}>
              <table className={isAdmin ? 'organization-table admin-table' : 'organization-table public-table'}>
                <caption className="sr-only">Organizaciones y sus directivas</caption>
                <thead><tr><th scope="col">Organización</th><th scope="col">Directiva</th>
                  {isAdmin && <><th scope="col">Vigencia</th><th scope="col">Estado</th><th scope="col">Acciones</th></>}
                </tr></thead>
                <tbody>{visibleRows.map((organization) => {
                  const shownDirectors = isAdmin ? organization.directors : organization.directors.filter((director) => roleOptions.slice(0, 3).includes(director.role));
                  return <tr key={organization.id}>
                    <th scope="row" className="organization-name-cell"><strong>{organization.name}</strong>
                      {isAdmin && <span className="organization-rut">{organization.rut ? `RUT ${organization.rut}` : 'RUT —'}</span>}
                    </th>
                    <td className="organization-directors-cell">{shownDirectors.length ? <button className="view-board-button" onClick={() => setDetailsRecord(organization)} aria-haspopup="dialog">
                      Ver directiva <span>{shownDirectors.length} {shownDirectors.length === 1 ? 'integrante' : 'integrantes'}</span>
                    </button> : <span className="table-empty">Directiva pendiente de actualizar.</span>}</td>
                    {isAdmin && <><td className="validity-cell">{organization.valid_until ? displayDate(organization.valid_until) : '—'}</td>
                      <td><span className={`status ${organization.status}`}>{organization.status === 'active' ? 'Activa' : 'Inactiva'}</span></td>
                      <td><div className="row-actions"><button className="text-action" onClick={() => openEditor(organization)}>Editar</button><button className="text-action danger" onClick={() => void removeOrganization(organization)}>Eliminar</button></div></td>
                    </>}
                  </tr>;
                })}</tbody>
              </table>
            </div>}
          <p className="list-footnote">{isAdmin ? `${visibleRows.length} de ${organizations.length} organizaciones` : 'Oficina Municipal de la Juventud · Municipalidad de Caldera'}</p>
        </section>
      </main>

      <footer className="footer"><span>REGISTRO COMUNAL DE ORGANIZACIONES JUVENILES</span><span>Municipalidad de Caldera</span></footer>

      {detailsRecord && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailsRecord(null); }}>
        <section className="dialog details-dialog" role="dialog" aria-modal="true" aria-labelledby="details-title">
          <button className="close-button" onClick={() => setDetailsRecord(null)} aria-label="Cerrar detalle de directiva">×</button>
          <h2 id="details-title">{detailsRecord.name}</h2>
          <p className="details-intro">Directiva registrada{isAdmin ? ' · los datos personales son visibles solo para administración' : ''}</p>
          {isAdmin && <p className="details-meta">{detailsRecord.rut ? `RUT ${detailsRecord.rut}` : 'RUT —'}<span>{detailsRecord.valid_until ? `Vigencia hasta ${displayDate(detailsRecord.valid_until)}` : 'Vigencia —'}</span></p>}
          <ul className="director-detail-list">{(isAdmin ? detailsRecord.directors : detailsRecord.directors.filter((director) => roleOptions.slice(0, 3).includes(director.role))).map((director, index) => <li key={director.id ?? `${director.role}-${index}`}>
            <div className="director-detail-main"><div><strong>{director.role}</strong><span>{director.name}</span></div>
              {director.email ? <a href={`mailto:${director.email}`}>{director.email}</a> : <span className="detail-missing">Sin correo registrado</span>}
            </div>
            {isAdmin && (director.address || director.phone) && <div className="private-details">{director.address && <span>Domicilio: {director.address}</span>}{director.phone && <span>Teléfono: {director.phone}</span>}</div>}
          </li>)}</ul>
        </section>
      </div>}

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
            <div className="director-form-heading"><div><h3>Directiva</h3><p>Domicilio y teléfono son privados y solo los verá administración.</p></div><button type="button" className="text-action" onClick={() => setDirectors((rows) => [...rows, { ...emptyDirector(), role: 'Otro cargo' }])}>＋ Agregar integrante</button></div>
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
