# FiberGuard frontend

Next.js 15 (App Router, TypeScript) + Tailwind CSS 4, Recharts, TanStack Query, Sonner, lucide-react, framer-motion.

```powershell
npm install
copy .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                    # http://localhost:3000 (start the backend first)
```

Pages: `/` Live Monitor (WebSocket waterfall, fiber route, alerts), `/analyze` (upload or pick a sample, explanation),
`/events` (history, filters, CSV), `/models` (comparison, generalisation, confusion matrices), `/about`.

Code map: `lib/api.ts` typed REST client, `lib/ws.ts` WebSocket with reconnect, `lib/classes.ts` class names, colours
and icons, `lib/sound.ts` WebAudio beeps, `components/stream-provider.tsx` app-wide live feed (frames are painted
straight to canvas, never stored in React state).
