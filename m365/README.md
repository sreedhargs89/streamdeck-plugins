# M365 Live — Stream Deck plugin

**Next Meeting** key: a live countdown to your next Outlook meeting.

| State | Key face |
|---|---|
| More than 5 min away | Blue · `in 23 min` (or `at 15:30` when 3 h+ away) |
| 5 min or less | Orange · `in 4 min` |
| 1 min or less | Flashing red · `NOW` |
| In progress | Green · `LIVE · 20m` (time left) |
| Nothing in 24 h | Grey · ✓ No more meetings |

**Tap** joins directly (Teams → `msteams:`, Zoom → `zoommtg:`, also Meet/Webex; falls back to the Outlook item).
**Long-press** shows time, organiser, attendees and room for 4 s.
Skips declined, cancelled, all-day, "free" and personal blocks (no attendees and no link). The calendar is
re-read every 2 minutes; the countdown ticks every 0.5 s.

## Setup (once per Mac)

1. An Entra app registration (single tenant, public client, redirect URI `http://localhost`,
   delegated `Calendars.Read`, `User.Read`, `offline_access`). With the Azure CLI:
   ```bash
   az ad app create --display-name "Stream Deck - Next Meeting" --sign-in-audience AzureADMyOrg \
     --is-fallback-public-client true --public-client-redirect-uris http://localhost \
     --required-resource-accesses '[{"resourceAppId":"00000003-0000-0000-c000-000000000000","resourceAccess":[{"id":"465a38f9-76ea-45b9-9f34-9e8b0d4b0b42","type":"Scope"},{"id":"e1fe6dd8-ba31-4d61-89e7-88639da4683d","type":"Scope"},{"id":"7427e0e9-2fba-42fe-b0c0-848c9e6a8182","type":"Scope"}]}]'
   ```
2. `npm install && npm run login -- --tenant <tenant-id> --client <app-client-id>`: opens the browser, stores the
   refresh token in the macOS Keychain (service `streamdeck-m365`) and the IDs in `~/.config/streamdeck-m365.json`.
3. `npm run pack` and open `dist/com.sree.m365.streamDeckPlugin`, or `npm run link` for development.
4. Drag **Next Meeting** from the **M365 Live** category onto a key.

If the sign-in ever expires, the key shows **Press to sign in**; pressing it opens the browser again.
`npm run login -- --logout` removes the token. Health check: `com.sree.m365.sdPlugin/logs/status.json`.

## Develop

```bash
npm test            # meeting selection, join links, countdown, images, PKCE
npm run reload      # rebuild + restart inside Stream Deck
node scripts/preview.js > preview/keys.svg   # key states from your live calendar
```
