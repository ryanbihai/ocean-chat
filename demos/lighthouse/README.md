# OceanBus Lighthouse Demo

Chat between your phone and computer through OceanBus — **zero server deployment required**.

```
Phone  ──WebSocket──>  Local Server  ──OceanBus──>  OceanBus Network  ──OceanBus──>  Terminal
                                                                                        │
Phone  <──WebSocket──  Local Server  <──OceanBus──  OceanBus Network  <──OceanBus──     │
                                                                         (your keystrokes)
```

The messages actually travel through the OceanBus cloud network and back — proving your Agent can reach any other Agent anywhere in the world, without a public IP, domain, SSL certificate, or Nginx config.

## Quick Start

```bash
cd demos/lighthouse
npm install
npm start
```

What happens:
1. **First run**: Two OceanBus Agent identities are auto-registered. Credentials are saved locally.
2. A QR code appears in your terminal.
3. **Scan the QR code** with your phone (must be on the same WiFi as your computer).
4. Type a message on your phone → it appears in your terminal.
5. Type a reply in your terminal → it appears on your phone.

Type `/quit` or press `Ctrl+C` to exit.

## How It Works

This demo runs **two OceanBus Agents** inside a single Node.js process:

| Agent | Platform | Input | Output |
|-------|----------|-------|--------|
| **Computer Agent** | Your terminal | Keyboard (readline) | Terminal display |
| **Phone Agent** | Express + WebSocket | Phone browser | Phone browser |

When you send a message from your phone:
1. The browser sends it via WebSocket to the local Express server
2. The server calls `obPhone.send(computerOpenid, text)`
3. OceanBus delivers the message through its cloud network
4. `obComputer.startListening()` receives it and prints it to your terminal

The reverse path is symmetric — what you type in the terminal goes to your phone's browser via OceanBus.

**Both agents are running on your machine. The messages traveled through OceanBus's cloud infrastructure — but you never deployed a server, configured DNS, or opened a firewall port.**

## Why This Matters

OceanBus is an **AI Agent communication and trust infrastructure**. This demo shows the foundation:

- **Global addressing without deployment**: `register()` gives your Agent a permanent global address. No domain, no SSL, no Nginx.
- **End-to-end encrypted messaging**: Messages are XChaCha20-Poly1305 encrypted. OceanBus cannot read them.
- **Two independent identities**: Two Agents with different addresses, communicating through the network.

The full OceanBus SDK also provides:
- **Yellow Pages** — Service discovery ("find me a restaurant Agent")
- **Reputation** — Trust decisions ("is this agent reliable?")
- **Cryptographic signatures** — Ed25519 message signing
- **Anti-fraud interceptors** — Automatic scam detection

→ [OceanBus on npm](https://www.npmjs.com/package/oceanbus)

## Troubleshooting

**Phone can't connect (page doesn't load)**
- Make sure your phone is on the same WiFi network as your computer
- Try opening the URL manually in your phone's browser (shown above the QR code)
- Check if a firewall is blocking port 3000

**Port 3000 is in use**
```bash
PORT=3001 npm start
```

**"Cannot reach OceanBus network"**
- Check your internet connection
- The OceanBus API is at `https://ai-t.ihaola.com.cn/api/l0`

**Messages not arriving**
- Wait a few seconds — OceanBus polling happens every 2 seconds
- Check both agents are registered (the terminal shows "ready" messages)

**QR code doesn't scan**
- Copy the URL printed in the terminal and type it into your phone's browser manually

**Re-running the demo**
- Credentials are saved in `demo-data/identities.json`. Delete this file to get fresh identities.
