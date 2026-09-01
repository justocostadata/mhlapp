# MHLAPP — PROJECT BIBLE
## MVP COMPETENCIA — VERSIÓN 1.0

Este documento es la fuente de verdad funcional y técnica de MHLApp.
El objetivo inmediato es operar una competencia real de Master Hood League dentro de aproximadamente 15 días.

## 1. Principio central
MHLApp es el sistema operativo deportivo de MHL. La unidad central es el PARTIDO.
Jugador → Partido → Participación → Resultado → Estadísticas → Historial → Ranking.

## 2. Alcance MVP
### Jugador
Registro/login, reclamar perfil histórico, perfil/estadísticas, equipo, próximos partidos, amistosos, confirmar/rechazar, ver precio y estado de pago.

### Coach
Login, equipo/plantilla, próximos partidos, convocar jugadores, ver confirmaciones y definir plantilla/posición cuando corresponda.

### Planillero
Solo partidos asignados; lista de confirmados; asistencia; quién pagó/debe; registrar cobros manuales; iniciar partido; cargar eventos rápido; finalizar/publicar.

### Admin
Usuarios/roles, player claims, jugadores, equipos/coaches, competencias, fixture, crear/configurar partidos, asignar planillero, confirmaciones/pagos, resultados y estadísticas.

## 3. Fuera del MVP
No implementar ahora: créditos/energías, Mercado Pago, Cryptohood, mercado, subastas, shop, chat, app nativa, multi-tenant completo, suscripciones SaaS.

## 4. Stack definitivo
Next.js App Router + React + TypeScript strict + Tailwind. Supabase Auth/Postgres/RLS/Storage. GitHub como fuente de código. Vercel para deploy.
No depender de Lovable Cloud ni reutilizar su arquitectura.

## 5. Base existente — no reiniciar
Usar el Supabase MHL actual. Ya contiene el histórico migrado y la nueva arquitectura.
No recrear la base ni volver a migrar datos.

## 6. Legacy congelado
No usar para features nuevas, no modificar ni borrar todavía:
- `Equipos`
- `Jugadores`
- `Partidos`
- `Estadisticas`

## 7. Fuente de verdad nueva
Identidad: `profiles`, `roles`, `user_roles`.
Deporte: `players`, `teams`, `team_members`, `team_coaches`, `seasons`, `competition_types`, `competitions`, `competition_teams`, `match_types`, `matches`, `match_players`, `match_event_types`, `match_events`.
Vinculación: `player_claims`.
Cuarentena legacy: `legacy_unmatched_match_events`.

## 8. Player no es User
Un jugador deportivo puede existir sin cuenta. `players.user_id` puede ser NULL. Al reclamar un perfil, Admin aprueba y vincula la cuenta.
Nunca vincular automáticamente solo por nombre.

## 9. Roles
`player`, `coach`, `planillero`, `admin`. Un usuario puede tener varios roles. Seguridad backend-first mediante RLS.

## 10. Motor del partido
Debe ser un único motor configurable para `friendly` y `competition`.
Debe poder configurar: fecha/hora, cancha, local/visitante, precio, moneda, cupos, modalidad de inscripción, quién selecciona jugadores/equipos/posición, confirmación, pago, planillero, estado.
No hardcodear precios o cupos en componentes.

## 11. Próximas tablas necesarias — NO crear sin migration aprobada
### `match_registrations`
Pre-partido: invitación/reserva/confirmación/rechazo/cancelación/no-show, equipo asignado, posición solicitada/asignada, importe debido.
No confundir con `match_players`, que representa participación deportiva real.

### `match_payments`
Ledger de cobro por inscripción/partido. No usar solo `paid=true`.
Guardar registration, monto, medio, estado, cobrador, fecha, referencia/notas.
MVP: efectivo/transferencia/manual. Mercado Pago queda para después.

### `match_staff`
Asignación de staff por partido. MVP: planillero. Futuro: árbitro/fotógrafo.

Toda modificación de schema debe proponerse, revisarse, migrarse y verificarse antes de código dependiente.

## 12. Planillero
Mobile-first extremo. Antes del partido ve confirmados, pagos, pendientes y total a cobrar. Registra cobro y asistencia. Durante el partido: Gol, Asistencia, Falta, Amarilla, Roja, Azul, Atajada, Penal atajado. Evento → jugador → guardar. Puede corregir según RLS.

## 13. Coach
Solo equipos asignados por `team_coaches`. Convoca y gestiona plantilla según configuración del partido. Nunca administrar equipos ajenos.

## 14. Estadísticas
Fuente: `match_events` + `match_players`. No guardar acumulados manuales como fuente principal. Ranking no bloquea el lanzamiento.

## 15. Competencia
Master League, Master Cup/League Master Cup y Master Hood cuando corresponda. Fixture, jornadas, fases, zonas, resultados. Brackets pueden tener placeholders hasta conocer ganadores. No inventar equipos.

## 16. UX
Identidad MHL: oscura, deportiva, premium, minimalista, mobile-first. Jugador y Planillero optimizados para teléfono; Admin prioritariamente desktop pero responsive. No dashboard SaaS genérico.

## 17. Next/Supabase
Server Components por defecto; Client Components solo cuando corresponda. Clientes Supabase browser/server separados usando `@supabase/ssr`. Sesión por cookies. Nunca `service_role` en browser.

## 18. Migraciones
Cambios nuevos viven en `supabase/migrations`. Flujo: proponer → revisar → aprobar → ejecutar → validar → commit. No ejecutar SQL improvisado y olvidarlo.

## 19. Git/Vercel
Repo objetivo `mhlapp-next`. `main` producción; `develop` integración; feature branches para cambios importantes. No desarrollar directo en main. Vercel conectado a GitHub; secrets/env vars en Vercel, no en Git.

## 20. Orden de implementación
0 Bootstrap.
1 Auth/roles.
2 Perfil + player claim + aprobación Admin.
3 Equipos + Coach.
4 Motor del partido + registrations.
5 Planillero + pagos manuales + staff.
6 Partido en vivo + match_players + events.
7 Competencia + fixture + tabla.
8 Ranking si el core está estable.
9 QA mobile/RLS/errores/performance.

## 21. Criterio de alcance
Antes de agregar algo: ¿es necesario para operar amistosos o la Copa que empieza en ~15 días? Si no, postergar.

## 22. MVP terminado
Admin crea competencia/partido y asigna Coach/Planillero; Coach convoca; jugador se loguea, recupera perfil, ve y confirma partido; Planillero cobra pendientes, registra asistencia y eventos, cierra partido; resultado/estadísticas/fixture funcionan; mobile y RLS son correctos; corre en Vercel y GitHub conserva versiones.

## 23. Regla para agentes
Leer esta biblia antes de tocar código. No inventar columnas ni relaciones. Si se requiere DB, detenerse y proponer migration con impacto/RLS/riesgo. Una tarea por vez. Typecheck/build antes de cerrar.
