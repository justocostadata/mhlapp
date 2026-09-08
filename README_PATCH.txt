MHLApp - Competition V1 stabilization patch

Copy the src folder over C:\mhlapp\mhlapp-starter and allow file replacement.

This patch only changes frontend Admin competition creation:
- dependent competition/team selectors
- prevents selecting the same team twice
- removes React <option selected> warning
- resets teams when competition changes
- removes technical implementation labels from the visible form
- does not modify Supabase, migrations, backend RPCs, Friendly V1, Coach, Player or Scorekeeper flows

After copying run:
  npm.cmd run typecheck
  npm.cmd run build
  npm.cmd run dev
