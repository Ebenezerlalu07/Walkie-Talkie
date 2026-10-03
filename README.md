# Voki Talk - Next.js Walkie-Talkie

A simple internet walkie-talkie using Next.js, WebRTC and Socket.IO.

## 1. Install frontend dependencies

```bash
npm install
npm install socket.io-client
```

## 2. Install signaling server dependency

```bash
npm install socket.io
```

## 3. Configure frontend

Create `.env.local`:

```env
NEXT_PUBLIC_SIGNALING_URL=http://localhost:4000
```

## 4. Start signaling server

```bash
npm run signal
```

## 5. Start Next.js

Open a second terminal:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Test on two devices

For localhost testing, use two browser windows on the same computer.

For phones, deploy both frontend and signaling server with HTTPS.

## Production deployment

Frontend: Vercel
Signaling server: Railway, Render, Fly.io, VPS, AWS, etc.

Set:

```env
NEXT_PUBLIC_SIGNALING_URL=https://your-signaling-server.com
```

On the signaling server set:

```env
CLIENT_ORIGIN=https://your-frontend-domain.com
```

## Important: TURN server

The included STUN servers are enough for many networks, but not all.
For reliable production use across mobile networks and restrictive NAT/firewalls, add a TURN server.

Example:

```js
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:YOUR_TURN_SERVER:3478',
    username: 'YOUR_USERNAME',
    credential: 'YOUR_PASSWORD'
  }
]
```

Use a service such as Twilio Network Traversal, Metered TURN, Cloudflare TURN, or your own coturn server.

## Browser requirements

- HTTPS in production
- Microphone permission
- Modern Safari, Chrome, Edge or Firefox

## How it works

1. Users enter the same room code.
2. Socket.IO handles signaling and room membership.
3. WebRTC connects browsers for audio.
4. Microphone tracks remain muted until Push-to-Talk is held.
5. Releasing the button disables microphone transmission.
