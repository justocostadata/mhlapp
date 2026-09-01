# MHLApp Next

Frontend limpio del MVP de Master Hood League.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript strict
- Tailwind CSS 4
- Supabase Auth + PostgreSQL + RLS
- Vercel

## Arranque local

1. Copiar `.env.example` a `.env.local`.
2. Completar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con el proyecto MHL existente.
3. Instalar y correr:

```bash
npm install
npm run dev
```

4. Abrir `http://localhost:3000`.
5. Probar `/login` con un usuario existente del Supabase MHL.

## Reglas

Antes de tocar código o base, leer `PROJECT_BIBLE.md` y `AGENTS.md`.
Las tablas legacy `Equipos`, `Jugadores`, `Partidos`, `Estadisticas` no se usan para nuevas funcionalidades.
