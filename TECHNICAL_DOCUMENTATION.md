# P2P Chat Application - Technical Documentation

## 1. Project Objective
The objective of this project is to provide a **secure, serverless, and private** instant messaging platform. By utilizing Peer-to-Peer (P2P) technology, it ensures that messages are transmitted directly between users without passing through or being stored on a central database, ensuring maximum privacy and minimal infrastructure costs.

## 2. Scope
*   **In Scope:**
    *   Real-time one-on-one text messaging.
    *   Connection via unique "Peer IDs".
    *   Automatic connection handling (STUN traversal for firewalls).
    *   Responsive UI for Desktop and Mobile (Glassmorphism design).
    *   Custom Username selection.
*   **Out of Scope:**
    *   Group chats.
    *   File sharing (images/videos).
    *   Offline messaging (as there is no server to store them).
    *   User authentication/Login system (stateless operation).

## 3. Technology Stack
| Component | Technology | Version | Description |
| :--- | :--- | :--- | :--- |
| **Frontend** | React.js | v19.x | Component-based UI library. |
| **Language** | JavaScript | ES6+ | Core logic. |
| **P2P Protocol** | WebRTC | - | Browser native API for real-time communication. |
| **Networking** | PeerJS | v1.5.x | A wrapper library that simplifies WebRTC signaling. |
| **Build Tool** | Vite | v7.x | High-performance frontend dev server and bundler. |
| **Styling** | Vanilla CSS3 | - | Custom Glassmorphism styles using CSS Variables. |

## 4. Required Software (Prerequisites)
To develop or build this project, the following software is required:

1.  **Node.js**: Runtime environment (Version 18.0 or higher recommended).
    *   *Download*: [nodejs.org](https://nodejs.org/)
2.  **Git**: For version control.
    *   *Download*: [git-scm.com](https://git-scm.com/)
3.  **Code Editor**: VS Code (recommended).
4.  **Web Browser**: Chrome, Firefox, or Edge (WebRTC compatible).

## 5. Folder Structure Explained
Here is the layout of the project files and what they do:

```text
p2p-chat/
├── dist/                   # Production build files (created after 'npm run build')
├── public/                 # Static assets (favicons, manifest.json)
├── src/                    # MAIN SOURCE CODE
│   ├── assets/             # Images and icons
│   ├── App.css             # Main stylesheet (Glassmorphism, Layouts, Animations)
│   ├── App.jsx             # CORE LOGIC: Handles PeerJS connection, UI states, and messaging
│   ├── index.css           # Global styles and resets
│   └── main.jsx            # Entry point (Mounts React to the DOM)
├── .gitignore              # Files to ignore in Git (node_modules, etc.)
├── package.json            # Project configuration, scripts, and dependencies list
└── vite.config.js          # Vite build configuration (Port settings, plugins)
```

## 6. Code Walkthrough (For Developers)

### The Core Logic: `src/App.jsx`
The entire application logic resides in a single functional component to maintain simplicity.

#### A. State Management
We use `useState` to track:
*   `myId`: The local user's Peer ID.
*   `conn`: The active WebRTC data connection object.
*   `messages`: An array of message objects `{ sender, text, timestamp }`.
*   `screen`: Controls the view (`setup` -> `connect` -> `chat`).

#### B. Initialization (`initializePeer`)
*   We instantiate `new Peer()` with a config containing **ICE Servers** (STUN).
*   **STUN Servers**: `stun.l.google.com` and `global.stun.twilio.com` are used to punch through NAT/Firewalls.
*   We listen for the `open` event to know we are online.

#### C. Connection Handling
1.  **Incoming**: `peer.on('connection', ...)` triggers when a friend connects. We auto-accept and wait for the channel to open.
2.  **Outgoing**: `peer.connect(remoteId)` initiates a connection.
3.  **Timeout**: We implemented a 10s timeout. If `connection.open` is false after 10s, we alert the user (critical for network debugging).

#### D. Messaging
*   `conn.send(string)`: Sends raw text data via the WebRTC DataChannel (SCTP).
*   `conn.on('data', ...)`: Listens for incoming data packets and updates the `messages` array.

### Styling Strategy: `src/App.css`
*   **Variables**: Colors defined in `:root` (e.g., `--primary`, `--glass-bg`) for consistent theming.
*   **Glassmorphism**: Achieved using `backdrop-filter: blur(16px)` and semi-transparent backgrounds `rgba(255, 255, 255, 0.05)`.
