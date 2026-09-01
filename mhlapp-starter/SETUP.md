# Primer arranque de MHLApp Next

## 1. Repo
Crear un repo GitHub vacío llamado `mhlapp-next`. Mantener `main` como producción. Después del primer push crear `develop`.

## 2. Variables locales
Copiar `.env.example` a `.env.local` y completar:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

No usar `service_role` ni secret keys.

## 3. Instalar

```bash
npm install
npm run typecheck
npm run dev
```

## 4. Smoke test
- `/` debe mostrar los conteos de `players`, `teams`, `matches`.
- `/jugadores`, `/equipos`, `/partidos` deben leer las tablas nuevas, nunca las legacy.
- `/login` debe permitir ingresar con un usuario ya existente en Supabase.
- El usuario Admin debe ver acceso a `/admin`.
- `/mi-perfil` debe mostrar si existe o no un `players.user_id` vinculado.

## 5. Vercel (después)
Conectar el repo y cargar las mismas variables en Vercel. `main` será Production; branches/PRs serán Preview.

## 6. Próximo slice
No seguir agregando pantallas. El siguiente trabajo es `Mi Perfil -> buscar player -> player_claim -> aprobación Admin`.
