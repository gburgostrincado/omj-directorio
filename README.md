# Registro de organizaciones juveniles · Caldera

Directorio público y panel privado de administración para la Oficina Municipal de la Juventud de Caldera. Es un solo repositorio con React/Vite, NestJS y PostgreSQL; Vercel publica la web y atiende `/api/*` desde una función NestJS.

## Requisitos

- Node.js 20 o superior y npm.
- Docker para levantar PostgreSQL local, o una URL de PostgreSQL disponible.

## Desarrollo local

```powershell
Copy-Item .env.example .env
docker compose up -d
npm install
npm run dev
```

Abre la URL que indique Vite (normalmente `http://localhost:5173`). La primera vez que inicia la API, crea las tablas y registra el usuario administrador indicado en `.env`. Cambia `ADMIN_PASSWORD` por una clave personal de al menos 12 caracteres y `JWT_SECRET` por una cadena aleatoria de al menos 32 caracteres. La contraseña de arranque solo se usa al crear el primer administrador de la base; cambiar el valor después no cambia una cuenta existente.

## Funciones incluidas

- Consulta pública sin cuenta, con nombre, directiva principal y correos de organizaciones activas, en formato de listado.
- Administración de RUT y vigencia, y cargos adicionales de la directiva.
- Domicilios particulares y teléfonos se guardan por integrante y solo se entregan en rutas protegidas para administración.
- Acceso administrativo con cookie de sesión `HttpOnly`, alta, edición, cambio de estado y eliminación.
- Las organizaciones inactivas y los controles de administración no se exponen en las respuestas públicas.
- No hay registro público ni datos de ejemplo.

## Preparar Vercel

Importa este repositorio como un solo proyecto. Configura estas variables en Vercel para Production y Preview. Usa una base distinta para Preview; no la conectes a los datos reales de producción.

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | URL de PostgreSQL; usa la conexión pooled de Neon para las funciones de Vercel |
| `ADMIN_USERNAME` | Usuario inicial de administración |
| `ADMIN_PASSWORD` | Contraseña inicial, de al menos 12 caracteres |
| `JWT_SECRET` | Secreto aleatorio de al menos 32 caracteres |

Vercel construye ambos lados con `npm run build`. La aplicación crea sus dos tablas al iniciar y usa `CREATE TABLE IF NOT EXISTS` para no reemplazar datos existentes.

## Datos

Las tablas `organizations` y `organization_directors` guardan los antecedentes de cada agrupación y sus cargos. `admin_users` conserva el usuario administrador y el hash bcrypt de su contraseña. La migración conserva las organizaciones ya ingresadas por la versión inicial y separa su directiva.
