# P2P Chat Application

A **serverless, region-agnostic peer-to-peer chat** application built with React, Vite, and WebRTC. Chat with anyone from anywhere in the world without any central server storing your messages.

## Features

✅ **Global Connectivity** - Works from any region or location  
✅ **Serverless** - No central server needed for messaging  
✅ **Private** - Messages never stored or visible to third parties  
✅ **One-on-One Chat** - Direct encrypted connection between peers  
✅ **Multi-Region Support** - Uses geographically distributed STUN/TURN servers  
✅ **Cross-Firewall** - Automatic NAT traversal and relay fallback  
✅ **Responsive Design** - Works on desktop and mobile devices  

## Quick Start

### Prerequisites
- Node.js 18+ ([download](https://nodejs.org/))
- npm (comes with Node.js)
- Any modern web browser (Chrome, Firefox, Edge)

### Installation & Running

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm preview
```

The app will be available at:
- **Local Access**: `http://localhost:5173/`
- **Network Access**: `http://YOUR_IP:5173/` (from other devices on same network)

## How to Use

### 1. **Start the App**
   - Both users need to access the app (locally or from different regions)

### 2. **Choose a Display Name**
   - Enter any name (e.g., "Alice", "Bob") - this will be your peer ID

### 3. **Share Your Peer ID**
   - Your unique ID is displayed and can be copied
   - Share it with your friend through any channel (WhatsApp, Email, etc.)

### 4. **Connect to a Friend**
   - Enter your friend's peer ID in the "Connect with a friend" field
   - Click "Connect"

### 5. **Start Chatting**
   - Once connected, send and receive messages in real-time
   - Connection is direct P2P - no server stores your messages

## Global Region Support

This app is **optimized to work from any region** with:

- **Multiple STUN Servers**: Google, Twilio, EkIGA, and others across different geographic regions
- **TURN Fallback**: If direct P2P is blocked, connection automatically relays through available servers
- **ICE Negotiation**: Automatic selection of best path (direct or relay)
- **Timeout Handling**: Extended timeouts for intercontinental connections

### Troubleshooting Connection Issues

| Issue | Solution |
|-------|----------|
| "Peer not found" | Ensure peer is online and has shared correct ID |
| Connection times out | Check internet connection; wait 15 seconds for STUN negotiation |
| Behind restrictive firewall | TURN relay will activate automatically; no action needed |
| Using VPN/Proxy | Disable VPN or try a different VPN server |
| Both users in same location | Works perfectly - uses local network connection |

## Technology Stack

- **Frontend**: React 19.x
- **Build Tool**: Vite 7.x
- **P2P Protocol**: WebRTC (browser native)
- **Signaling**: PeerJS 1.5.x
- **Styling**: CSS3 with Glassmorphism
- **Network**: Global STUN/TURN servers

## File Structure

```
src/
├── App.jsx           # Core P2P logic, connection handling
├── App.css           # Glassmorphic UI styles
├── main.jsx          # React entry point
├── index.css         # Global styles
└── assets/           # Images and icons
```

## Deployment

### For Production Use
1. Build the app: `npm run build`
2. Deploy the `dist/` folder to any static hosting:
   - Vercel, Netlify, GitHub Pages
   - AWS S3, Azure Static, Google Cloud Storage
   - Any web server (Apache, Nginx)
3. App works immediately - no backend server required

### Share Globally
Since it's serverless, just share the deployed URL with anyone worldwide - they can join your chat instantly.

## Privacy & Security

- ✅ **End-to-End**: All communication is P2P
- ✅ **No Logs**: No messages stored on servers
- ✅ **WebRTC Encryption**: Data channel uses DTLS-SRTP
- ✅ **No Registration**: No personal data collected

## Troubleshooting

### App won't start
```bash
# Clear cache and reinstall
rm -r node_modules package-lock.json
npm install
npm run dev
```

### Port 5173 already in use
```bash
# Vite will find the next available port automatically
npm run dev
```

### Connection issues across regions
- STUN/TURN servers are global - give connections 15 seconds
- Check browser DevTools (F12) > Console for detailed errors
- Both users must use modern browsers with WebRTC support

## Contributing

Feel free to fork, modify, and deploy. This is a fully open-source P2P solution.

## License

Open source - use freely anywhere in the world.

---

**Built for Global Connectivity** - Chat from anywhere, with anyone, without limits.
