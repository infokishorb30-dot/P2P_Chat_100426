# Netlify Deployment Guide - P2P Chat Application

This guide will help you deploy the P2P Chat application to **Netlify** in minutes. The app is serverless and requires no backend setup.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Automatic Deployment (Recommended)](#automatic-deployment-recommended)
3. [Manual Deployment](#manual-deployment)
4. [Configuration & Environment](#configuration--environment)
5. [Post-Deployment Testing](#post-deployment-testing)
6. [Troubleshooting](#troubleshooting)
7. [Custom Domain Setup](#custom-domain-setup)

---

## Prerequisites

Before starting, ensure you have:

- ✅ **GitHub Account** - If using automatic deployment
- ✅ **Netlify Account** - Free account at [netlify.com](https://netlify.com)
- ✅ **Git** - Version control installed locally
- ✅ **Node.js 18+** - For building locally (if using manual deployment)

---

## Automatic Deployment (Recommended)

### Step 1: Connect GitHub Repository

1. **Push your code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: P2P Chat app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/p2p-chat.git
   git push -u origin main
   ```

2. **Go to Netlify Dashboard**
   - Visit [netlify.com](https://netlify.com)
   - Click **"Add new site"** → **"Import an existing project"**

3. **Select GitHub**
   - Choose **GitHub** as your Git provider
   - Authorize Netlify to access your GitHub repositories
   - Select your `p2p-chat` repository

### Step 2: Configure Build Settings

Netlify will auto-detect your project. Verify these settings:

| Setting | Value |
|---------|-------|
| **Build Command** | `npm run build` |
| **Publish Directory** | `dist` |
| **Node Version** | `18.x` or later |

These are already configured correctly in your `package.json` and `vite.config.js`.

### Step 3: Deploy

1. Click **"Deploy"**
2. Netlify builds your app automatically
3. Your site goes live at: `https://your-site-name.netlify.app`

**That's it!** Your app is now deployed. Every time you push to `main` branch, Netlify rebuilds automatically.

---

## Manual Deployment

### Step 1: Build Locally

```bash
cd p2p-chat-v2-main
npm install
npm run build
```

This creates a `dist/` folder with production-ready files.

### Step 2: Upload to Netlify

**Option A: Drag & Drop**
1. Go to [netlify.com/drop](https://app.netlify.com/drop)
2. Drag the `dist/` folder into the drop zone
3. Site goes live instantly at a random URL

**Option B: Netlify CLI**
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

Follow the CLI prompts to authenticate and deploy.

---

## Configuration & Environment

### netlify.toml Configuration File

Create a `netlify.toml` file in your project root for advanced Netlify settings:

```toml
# netlify.toml
[build]
command = "npm run build"
publish = "dist"
node_version = "18.x"

[build.environment]
# Environment variables (if needed in future)
NODE_ENV = "production"

[[redirects]]
from = "/*"
to = "/index.html"
status = 200

[[headers]]
for = "/*"
[headers.values]
X-Frame-Options = "DENY"
X-Content-Type-Options = "nosniff"
Referrer-Policy = "strict-origin-when-cross-origin"
```

**Why the redirect?** For single-page apps (SPAs), all routes should serve `index.html` so React Router can handle navigation.

### .netlify/functions Configuration (Optional)

If you ever need serverless functions (e.g., for analytics), Netlify supports them. For now, your P2P app needs none.

---

## Post-Deployment Testing

### Verify Your Deployment

1. **Check the Live Site**
   ```
   https://your-site-name.netlify.app
   ```

2. **Test P2P Chat Functionality**
   - Open two browser windows/tabs
   - Both go to your Netlify URL
   - Enter different names (Alice, Bob)
   - Exchange peer IDs and connect
   - Verify messages send/receive

3. **Mobile Testing**
   - Use phone to access your Netlify URL
   - Test chat from different device

4. **Cross-Region Testing**
   - Share your Netlify URL with friends in different countries
   - Verify chat works globally (thanks to global STUN/TURN servers)

### Check Build Logs

In Netlify Dashboard:
- **Deploys** tab shows build history
- Click any deploy to see detailed logs
- Look for `✓` marks for successful builds

---

## Troubleshooting

### Build Fails: "npm run build" error

**Solution:**
```bash
# Clear cache and rebuild locally
rm -rf node_modules package-lock.json
npm install
npm run build
```

Push changes and redeploy.

### Site Shows 404 or Blank Page

**Cause:** SPA routing issue
**Solution:** Check if `netlify.toml` redirect is present (see above)

### Chat Won't Connect

**Cause:** Network issues or STUN server blocked
**Solution:**
- Check browser console (F12 → Console tab)
- Verify both users are on latest app version
- Ensure both have valid peer IDs
- Wait 15+ seconds for STUN negotiation

### Build Takes Too Long

**Cause:** Node modules or network
**Solution:** Clear Netlify cache
1. Go to **Site Settings** → **Build & Deploy** → **Deploys**
2. Click **Clear Cache** and **Trigger Deploy**

---

## Custom Domain Setup

### Connect Your Own Domain

1. **In Netlify Dashboard**
   - Go to **Site Settings** → **Domain Management**
   - Click **Custom Domain** → **Add Domain**
   - Enter your domain (e.g., `chat.yourdomain.com`)

2. **Update DNS Records**

   For `yourdomain.com` registrar (GoDaddy, Cloudflare, etc.):
   
   **Add these DNS records:**
   ```
   Type: CNAME
   Name: chat
   Value: your-site-name.netlify.app
   ```

3. **Wait for DNS Propagation**
   - Can take 5 minutes to 48 hours
   - Check status with: `nslookup chat.yourdomain.com`

4. **Enable HTTPS**
   - Netlify auto-generates SSL certificate
   - Site now accessible at `https://chat.yourdomain.com`

---

## Environment Variables (for Future Use)

If you add backend integration later, set environment variables:

1. **Netlify Dashboard** → **Site Settings** → **Build & Deploy** → **Environment**
2. Click **Edit Variables**
3. Add key-value pairs (e.g., `API_KEY`, `TURN_SERVER`)

Reference in code:
```javascript
const apiKey = import.meta.env.VITE_API_KEY
```

In `.env.local`:
```
VITE_API_KEY=your_key_here
```

---

## Performance Optimization

### Deployed Site is Slow?

1. **Check Bundle Size**
   ```bash
   npm run build
   # Check dist folder size
   ```

2. **Enable Netlify Caching**
   - Go to **Site Settings** → **Build & Deploy** → **Post Processing**
   - Enable **Asset Optimization** (automatic compression)
   - Enable **Pretty URLs**

3. **Enable CDN**
   - Netlify uses a global CDN automatically
   - Your app serves fast worldwide

### Analytics

To add analytics without privacy concerns:
- Use open-source **Plausible** or **Fathom Analytics**
- No third-party tracking
- GDPR compliant

---

## Rollback to Previous Deploy

If something breaks:

1. **Netlify Dashboard** → **Deploys**
2. Find the previous working version
3. Click **Restore** on that deploy
4. Site instantly reverts to that version

---

## Continuous Deployment Workflow

```
Local Development → Git Push → GitHub → Netlify Auto-Builds → Live ✓
```

Every push to `main` branch automatically triggers:
1. Code build (`npm run build`)
2. Tests (if configured)
3. Deployment to CDN
4. Instant live update

---

## Security Checklist

✅ **HTTPS** - Automatically enabled by Netlify  
✅ **No Backend** - No server to hack  
✅ **No Sensitive Data** - No API keys exposed  
✅ **WebRTC Encrypted** - P2P connection uses DTLS-SRTP  
✅ **CORS Configured** - Production deployment restrictions  
✅ **Headers Set** - `netlify.toml` includes security headers  

---

## Summary

| Step | Command | Time |
|------|---------|------|
| 1. Create account | [netlify.com](https://netlify.com) | 2 min |
| 2. Connect GitHub | Link repo | 5 min |
| 3. Add project | Select p2p-chat | 2 min |
| 4. Deploy | Click deploy | 2 min |
| **Total** | - | **11 minutes** |

---

## Support & Resources

- **Netlify Docs:** [docs.netlify.com](https://docs.netlify.com)
- **Vite Docs:** [vitejs.dev](https://vitejs.dev)
- **PeerJS Docs:** [peerjs.com](https://peerjs.com)
- **React Docs:** [react.dev](https://react.dev)

---

## Next Steps

Once deployed:
1. Share your Netlify URL with friends
2. Test chat from different regions
3. Monitor with Netlify Analytics
4. Scale as needed (serverless = infinite scale)

**Your P2P Chat is now live to the world! 🚀**

---

*Last Updated: February 26, 2026*
