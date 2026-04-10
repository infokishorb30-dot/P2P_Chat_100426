import { useState, useEffect, useRef } from 'react'
import Peer from 'peerjs'
import './App.css'

const MAX_MESSAGE_LENGTH = 500
const EMOJIS = ['😄','😂','❤️','👍','🎉','🔥','😢','😮','🙏','👏','😍','🤔','✅','👋','🤝','💯']

function genGroupId() {
  return 'grp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
}

// Deterministic color per sender name for group chat labels
function senderColor(name = '') {
  const palette = ['#e53935','#8e24aa','#1e88e5','#00897b','#f4511e','#6d4c41','#039be5','#43a047']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

function App() {
  // ── Core state ─────────────────────────────────────────────────────
  const [myId, setMyId]         = useState('')
  const [screen, setScreen]     = useState('setup')
  const [status, setStatus]     = useState('')        // eslint-disable-line no-unused-vars
  const [errorObj, setErrorObj] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isCopied, setIsCopied] = useState(false)
  const [customIdObj, setCustomIdObj] = useState('')
  const [connectError, setConnectError] = useState(null)

  // ── DM state ───────────────────────────────────────────────────────
  const [activeChatId, setActiveChatId]     = useState(null)
  const [activeChatType, setActiveChatType] = useState('dm') // 'dm' | 'group'
  const [contacts, setContacts] = useState(() => {
    const s = localStorage.getItem('p2p_contacts'); return s ? JSON.parse(s) : {}
  })
  const [sessions, setSessions] = useState(() => {
    const s = localStorage.getItem('p2p_sessions'); return s ? JSON.parse(s) : {}
  })

  // ── Group state ────────────────────────────────────────────────────
  const [groups, setGroups] = useState(() => {
    const s = localStorage.getItem('p2p_groups'); return s ? JSON.parse(s) : {}
  })
  const [groupSessions, setGroupSessions] = useState(() => {
    const s = localStorage.getItem('p2p_group_sessions'); return s ? JSON.parse(s) : {}
  })
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showGroupInfo, setShowGroupInfo]     = useState(false)
  const [newGroupName, setNewGroupName]       = useState('')
  const [selectedMembers, setSelectedMembers] = useState([])
  const [addMemberInput, setAddMemberInput]   = useState('')
  const [addMemberError, setAddMemberError]   = useState('')

  // ── Input / UI state ───────────────────────────────────────────────
  const [inputValue, setInputValue]           = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isConnecting, setIsConnecting]       = useState(false)
  const [newPeerId, setNewPeerId]             = useState('')

  // ── Refs ───────────────────────────────────────────────────────────
  const peerRef              = useRef(null)
  const connectionsRef       = useRef({})   // { [peerId]: DataConnection }
  const messageQueueRef      = useRef({})   // { [peerId]: string[] }
  const reconnectAttemptsRef = useRef({})
  const reconnectTimeoutRef  = useRef({})
  const userInitiatedRef     = useRef(false)
  // Stable refs to avoid stale closures inside PeerJS event handlers
  const activeChatRef        = useRef({ id: null, type: 'dm' })
  const myIdRef              = useRef('')
  const groupsRef            = useRef({})   // always holds latest groups without stale closures
  const messagesEndRef       = useRef(null)
  const inputRef             = useRef(null)
  const seenMsgIdsRef        = useRef(new Set()) // dedup for group msg relay
  const isOnlineRef          = useRef(navigator.onLine)
  const contactsRef          = useRef({})   // stable ref for contacts (for use in intervals)

  // Keep stable refs in sync with state
  useEffect(() => { activeChatRef.current = { id: activeChatId, type: activeChatType } }, [activeChatId, activeChatType])
  useEffect(() => { myIdRef.current = myId }, [myId])
  useEffect(() => { groupsRef.current = groups }, [groups])
  useEffect(() => { isOnlineRef.current = isOnline }, [isOnline])
  useEffect(() => { contactsRef.current = contacts }, [contacts])

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessions, groupSessions, activeChatId, activeChatType])

  // Persist DM state
  useEffect(() => {
    localStorage.setItem('p2p_contacts', JSON.stringify(contacts))
    localStorage.setItem('p2p_sessions', JSON.stringify(sessions))
  }, [contacts, sessions])

  // Persist Group state
  useEffect(() => {
    localStorage.setItem('p2p_groups', JSON.stringify(groups))
    localStorage.setItem('p2p_group_sessions', JSON.stringify(groupSessions))
  }, [groups, groupSessions])

  // ── Network events ─────────────────────────────────────────────────
  useEffect(() => {
    const up   = () => setIsOnline(true)
    const down = () => { setIsOnline(false); setErrorObj({ message: 'No internet connection.' }) }
    const bye  = () => Object.values(connectionsRef.current).forEach(c => c.open && c.close())
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    window.addEventListener('beforeunload', bye)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      window.removeEventListener('beforeunload', bye)
    }
  }, [])

  // ── Peer initialization ────────────────────────────────────────────
  const initializePeer = (customId) => {
    if (peerRef.current) peerRef.current.destroy()
    setStatus('Initializing...')
    const peer = new Peer(customId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          // Free public TURN relay — ensures connections work even through strict NAT
          { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
      }
    })
    peerRef.current = peer

    peer.on('open', (id) => {
      setMyId(id)
      myIdRef.current = id
      setScreen('main')
      setStatus('Ready')
      setErrorObj(null)
      autoReconnectKnownPeers()
    })

    peer.on('connection', handleIncomingConnection)

    peer.on('error', (err) => {
      console.error('Peer error:', err)
      if (err.type === 'unavailable-id') {
        setErrorObj({ message: 'That name is already taken. Please choose another.' })
        setStatus('')
        return
      }
      if (err.type === 'peer-unavailable') {
        if (userInitiatedRef.current) {
          setConnectError('Peer not found. Check the ID and try again.')
          userInitiatedRef.current = false
        }
        setIsConnecting(false)
        return
      }
      // Background disconnection / WebRTC errors — suppress from UI
      if (err.type === 'disconnected' || err.type === 'webrtc') {
        if (userInitiatedRef.current) {
          setConnectError('Connection failed. Check the Peer ID and try again.')
          userInitiatedRef.current = false
        }
        setIsConnecting(false)
        return
      }
      if (userInitiatedRef.current) {
        setConnectError(`Error: ${err.type}. Please try again.`)
        userInitiatedRef.current = false
      }
      setIsConnecting(false)
    })
  }

  const autoReconnectKnownPeers = () => {
    // Reconnect DM contacts
    Object.keys(contacts).forEach(pid => {
      if (!connectionsRef.current[pid] || !connectionsRef.current[pid].open) attemptReconnect(pid)
    })
    // FIX: Also reconnect to group members who may not be DM contacts
    Object.values(groupsRef.current).forEach(group => {
      ;(group.members || []).forEach(pid => {
        if (pid !== myIdRef.current && (!connectionsRef.current[pid] || !connectionsRef.current[pid].open)) {
          reconnectAttemptsRef.current[pid] = 0 // reset counter for a fresh startup attempt
          attemptReconnect(pid)
        }
      })
    })
  }

  // ── Contact helpers ────────────────────────────────────────────────
  const updateContactStatus = (id, online) => {
    setContacts(prev => {
      const ex = prev[id] || { id, displayName: id, unread: 0, lastActivity: Date.now() }
      return { ...prev, [id]: { ...ex, isOnline: online, lastActivity: Date.now() } }
    })
  }

  // ── Group message dispatcher ───────────────────────────────────────
  const handleGroupMessage = (data, fromPeerId) => {       // eslint-disable-line no-unused-vars
    switch (data.type) {
      case 'group_invite': {
        // FIX: Upsert (merge) instead of overwrite — never lose members from a stale invite
        setGroups(prev => {
          const existing = prev[data.groupId]
          const mergedMembers = existing
            ? [...new Set([...existing.members, ...(data.members || [])])]
            : (data.members || [])
          return {
            ...prev,
            [data.groupId]: {
              id: data.groupId,
              name: data.groupName,
              members: mergedMembers,
              createdBy: data.invitedBy,
              createdAt: existing?.createdAt || Date.now(),
              unread: existing?.unread || 0,
              lastActivity: existing?.lastActivity || Date.now()
            }
          }
        })
        // FIX: Reset attempt counter before reconnecting so the 5-attempt limit never silently blocks
        ;(data.members || []).forEach(pid => {
          if (pid !== myIdRef.current && (!connectionsRef.current[pid] || !connectionsRef.current[pid].open)) {
            reconnectAttemptsRef.current[pid] = 0
            attemptReconnect(pid)
          }
        })
        break
      }
      case 'group_msg': {
        // ── Deduplication ────────────────────────────────────────────────
        // Prevents the same message being shown twice when it arrives via
        // both a direct connection AND a relay path.
        if (data.msgId) {
          if (seenMsgIdsRef.current.has(data.msgId)) break
          seenMsgIdsRef.current.add(data.msgId)
          // Prune seen-set to prevent unbounded memory growth
          if (seenMsgIdsRef.current.size > 500) {
            const arr = [...seenMsgIdsRef.current]
            seenMsgIdsRef.current = new Set(arr.slice(arr.length - 400))
          }
        }
        // ── Store message ────────────────────────────────────────────────
        setGroupSessions(prev => ({
          ...prev,
          [data.groupId]: [...(prev[data.groupId] || []), {
            sender: data.sender,
            senderName: data.senderName || data.sender,
            text: data.text,
            timestamp: data.timestamp || Date.now()
          }]
        }))
        const ac = activeChatRef.current
        if (!(ac.type === 'group' && ac.id === data.groupId)) {
          setGroups(prev => {
            const g = prev[data.groupId]
            if (!g) return prev
            return { ...prev, [data.groupId]: { ...g, unread: (g.unread || 0) + 1, lastActivity: Date.now() } }
          })
        }
        // ── Relay ────────────────────────────────────────────────────────
        // Forward to every group member we're connected to, EXCEPT:
        //   • ourselves
        //   • the original sender (they already have it)
        //   • the peer who just forwarded it to us (prevents ping-pong)
        // This lets A→B→C work when A→C direct WebRTC fails.
        const grp = groupsRef.current[data.groupId]
        if (grp && data.msgId) {
          const relayStr = JSON.stringify(data)
          ;(grp.members || []).forEach(pid => {
            if (pid !== myIdRef.current && pid !== data.sender && pid !== fromPeerId) {
              const conn = connectionsRef.current[pid]
              if (conn && conn.open) {
                try { conn.send(relayStr) } catch {}
              }
            }
          })
        }
        break
      }
      case 'group_member_added': {
        setGroups(prev => {
          const g = prev[data.groupId]
          if (!g || g.members.includes(data.newMemberId)) return prev
          return { ...prev, [data.groupId]: { ...g, members: [...g.members, data.newMemberId] } }
        })
        if (data.newMemberId !== myIdRef.current &&
            (!connectionsRef.current[data.newMemberId] || !connectionsRef.current[data.newMemberId].open)) {
          attemptReconnect(data.newMemberId)
        }
        break
      }
      case 'group_member_removed': {
        if (data.removedMemberId === myIdRef.current) {
          // I was removed from the group
          setGroups(prev => { const u = { ...prev }; delete u[data.groupId]; return u })
          setActiveChatId(cur => cur === data.groupId ? null : cur)
        } else {
          setGroups(prev => {
            const g = prev[data.groupId]
            if (!g) return prev
            return { ...prev, [data.groupId]: { ...g, members: g.members.filter(m => m !== data.removedMemberId) } }
          })
        }
        break
      }
      case 'group_left': {
        setGroups(prev => {
          const g = prev[data.groupId]
          if (!g) return prev
          return { ...prev, [data.groupId]: { ...g, members: g.members.filter(m => m !== data.memberId) } }
        })
        break
      }
      default:
        console.warn('Unknown message type:', data.type)
    }
  }

  // ── Connection management ──────────────────────────────────────────
  const handleIncomingConnection = (connection) => {
    const pid = connection.peer
    const existing = connectionsRef.current[pid]
    // Guard: if we already have an open connection, reject the duplicate.
    // Without this, two peers calling connect() simultaneously overwrites
    // the tracked ref, then the close-handler deletes the working connection.
    if (existing && existing.open) {
      try { connection.close() } catch {}
      return
    }
    connectionsRef.current[pid] = connection
    updateContactStatus(pid, true)
    setupConnectionListeners(connection)
  }

  const setupConnectionListeners = (connection) => {
    const pid = connection.peer

    connection.on('open', () => {
      setIsConnecting(false)
      updateContactStatus(pid, true)
      reconnectAttemptsRef.current[pid] = 0
      // Flush queued messages
      const queue = messageQueueRef.current[pid] || []
      while (queue.length > 0) {
        const msg = queue[0]
        try { connection.send(msg); queue.shift() } catch { break }
      }
      // FIX: Gossip — re-send group invites for every shared group.
      // Guarantees a peer who was offline when first invited always receives the group state
      // once they come back online, regardless of message queue state.
      Object.values(groupsRef.current).forEach(group => {
        const members = group.members || []
        if (members.includes(pid) && members.includes(myIdRef.current)) {
          try {
            connection.send(JSON.stringify({
              type: 'group_invite',
              groupId: group.id,
              groupName: group.name,
              members,
              invitedBy: myIdRef.current
            }))
          } catch { /* ignore — they'll get it on next open */ }
        }
      })
    })

    connection.on('data', (rawData) => {
      updateContactStatus(pid, true)
      // Detect typed group/system messages
      if (typeof rawData === 'string') {
        try {
          const parsed = JSON.parse(rawData)
          if (parsed && parsed.type) { handleGroupMessage(parsed, pid); return }
        } catch { /* not JSON — fall through to plain 1:1 handling */ }
      }
      // Plain 1:1 message
      setSessions(prev => ({
        ...prev,
        [pid]: [...(prev[pid] || []), { sender: 'peer', text: rawData, timestamp: Date.now() }]
      }))
      const ac = activeChatRef.current
      setContacts(prev => {
        if (ac.type === 'dm' && ac.id === pid) return prev
        const ex = prev[pid]
        return { ...prev, [pid]: { ...ex, unread: (ex?.unread || 0) + 1 } }
      })
    })

    connection.on('close', () => {
      // Only clean up if THIS exact connection is the one tracked in the ref.
      // A duplicate connection's close event should not remove the good connection.
      if (connectionsRef.current[pid] === connection) {
        updateContactStatus(pid, false)
        delete connectionsRef.current[pid]
      }
    })
    connection.on('error', (err) => {
      console.error(`Connection error with ${pid}:`, err)
      updateContactStatus(pid, false)
      attemptReconnect(pid)
    })
  }

  const attemptReconnect = (pid) => {
    if (reconnectTimeoutRef.current[pid]) clearTimeout(reconnectTimeoutRef.current[pid])
    const attempts = reconnectAttemptsRef.current[pid] || 0
    if (attempts >= 5) return
    reconnectAttemptsRef.current[pid] = attempts + 1
    const delay = Math.pow(2, attempts + 1) * 1000
    reconnectTimeoutRef.current[pid] = setTimeout(() => {
      if (!isOnlineRef.current || !peerRef.current) return
      if (!connectionsRef.current[pid] || !connectionsRef.current[pid].open) {
        const c = peerRef.current.connect(pid, { reliable: true })
        connectionsRef.current[pid] = c
        setupConnectionListeners(c)
      }
    }, delay)
  }

  // ── DM connect ─────────────────────────────────────────────────────
  const connectToPeer = () => {
    const pid = newPeerId.trim()
    if (!pid || !peerRef.current) return
    if (pid === myId) { setConnectError("Can't connect to yourself."); return }
    setIsConnecting(true)
    setConnectError(null)
    userInitiatedRef.current = true
    const conn = peerRef.current.connect(pid, { reliable: true })
    connectionsRef.current[pid] = conn
    updateContactStatus(pid, false)
    setActiveChatId(pid)
    setActiveChatType('dm')
    setShowGroupInfo(false)
    setupConnectionListeners(conn)
    setTimeout(() => {
      if (conn && !conn.open) {
        if (userInitiatedRef.current) {
          setConnectError(`Connection to "${pid}" timed out. Check the ID and try again.`)
          userInitiatedRef.current = false
        }
        setIsConnecting(false)
      }
    }, 15000)
  }

  // ── Typed message sender (group / system messages) ─────────────────
  const sendTypedMessage = (pid, payload) => {
    const str = JSON.stringify(payload)
    const conn = connectionsRef.current[pid]
    if (conn && conn.open) {
      try { conn.send(str); return } catch {}
    }
    // Queue for later + trigger reconnect
    if (!messageQueueRef.current[pid]) messageQueueRef.current[pid] = []
    messageQueueRef.current[pid].push(str)
    attemptReconnect(pid)
  }

  // ── Group management ───────────────────────────────────────────────
  const createGroup = () => {
    if (!newGroupName.trim() || selectedMembers.length === 0) return
    const groupId = genGroupId()
    const group = {
      id: groupId,
      name: newGroupName.trim(),
      members: [myId, ...selectedMembers],
      createdBy: myId,
      createdAt: Date.now(),
      unread: 0,
      lastActivity: Date.now()
    }
    setGroups(prev => ({ ...prev, [groupId]: group }))

    // For each member: if not currently connected, establish a direct connection
    // IMMEDIATELY (no delay) so the invite arrives as fast as possible.
    // sendTypedMessage will also trigger the exponential-backoff reconnect loop
    // as a secondary fallback.
    selectedMembers.forEach(pid => {
      if (!connectionsRef.current[pid] || !connectionsRef.current[pid].open) {
        reconnectAttemptsRef.current[pid] = 0  // fresh start
        if (peerRef.current) {
          const nc = peerRef.current.connect(pid, { reliable: true })
          if (nc) { connectionsRef.current[pid] = nc; setupConnectionListeners(nc) }
        }
      }
      sendTypedMessage(pid, {
        type: 'group_invite',
        groupId,
        groupName: group.name,
        members: group.members,
        invitedBy: myId
      })
    })

    setShowCreateGroup(false)
    setNewGroupName('')
    setSelectedMembers([])
    setActiveChatId(groupId)
    setActiveChatType('group')
  }

  const sendGroupMessage = (text) => {
    if (!activeChatId || activeChatType !== 'group' || !text.trim()) return
    const group = groups[activeChatId]
    if (!group) return
    const timestamp = Date.now()
    // Unique message ID — used for relay deduplication across all members
    const msgId = myId + '_' + timestamp.toString(36) + '_' + Math.random().toString(36).slice(2, 6)
    const payload = { type: 'group_msg', groupId: activeChatId, text, sender: myId, senderName: myId, timestamp, msgId }
    // Pre-register own message so relay-back doesn't duplicate it in our own view
    seenMsgIdsRef.current.add(msgId)
    // Broadcast to every other member
    group.members.filter(pid => pid !== myId).forEach(pid => sendTypedMessage(pid, payload))
    // Save locally
    setGroupSessions(prev => ({
      ...prev,
      [activeChatId]: [...(prev[activeChatId] || []), { sender: 'me', senderName: myId, text, timestamp }]
    }))
    setGroups(prev => ({ ...prev, [activeChatId]: { ...prev[activeChatId], lastActivity: timestamp } }))
  }

  const addMemberToGroup = () => {
    const pid = addMemberInput.trim()
    if (!pid || !activeChatId) return
    const group = groups[activeChatId]
    if (!group) return
    if (pid === myId) { setAddMemberError("That's you."); return }
    if (group.members.includes(pid)) { setAddMemberError('Already a member.'); return }

    const updatedMembers = [...group.members, pid]
    setGroups(prev => ({ ...prev, [activeChatId]: { ...prev[activeChatId], members: updatedMembers } }))

    // Notify all existing members
    group.members.filter(p => p !== myId).forEach(p =>
      sendTypedMessage(p, { type: 'group_member_added', groupId: activeChatId, newMemberId: pid })
    )
    // If not connected to new member, initiate connection
    if (!connectionsRef.current[pid] || !connectionsRef.current[pid].open) {
      if (peerRef.current) {
        const newConn = peerRef.current.connect(pid, { reliable: true })
        connectionsRef.current[pid] = newConn
        setupConnectionListeners(newConn)
      }
    }
    // Send invite to new member
    sendTypedMessage(pid, {
      type: 'group_invite',
      groupId: activeChatId,
      groupName: group.name,
      members: updatedMembers,
      invitedBy: myId
    })
    setAddMemberInput('')
    setAddMemberError('')
  }

  const removeMemberFromGroup = (groupId, peerId) => {
    const group = groups[groupId]
    if (!group) return
    const updatedMembers = group.members.filter(m => m !== peerId)
    setGroups(prev => ({ ...prev, [groupId]: { ...prev[groupId], members: updatedMembers } }))
    // Notify remaining members
    updatedMembers.filter(p => p !== myId).forEach(p =>
      sendTypedMessage(p, { type: 'group_member_removed', groupId, removedMemberId: peerId })
    )
    // Tell the removed peer
    sendTypedMessage(peerId, { type: 'group_member_removed', groupId, removedMemberId: peerId })
  }

  const leaveGroup = (groupId) => {
    const group = groups[groupId]
    if (!group) return
    group.members.filter(p => p !== myId).forEach(p =>
      sendTypedMessage(p, { type: 'group_left', groupId, memberId: myId })
    )
    setGroups(prev => { const u = { ...prev }; delete u[groupId]; return u })
    if (activeChatId === groupId) { setActiveChatId(null); setActiveChatType('dm') }
    setShowGroupInfo(false)
  }

  // ── Unified message send (DM + Group) ─────────────────────────────
  const sendMessage = (e, customText) => {
    if (e?.preventDefault) e.preventDefault()
    const text = customText || inputValue
    if (!text.trim() || text.length > MAX_MESSAGE_LENGTH) return

    if (activeChatType === 'group') {
      sendGroupMessage(text)
      setInputValue('')
      setShowEmojiPicker(false)
      return
    }

    if (!activeChatId) return
    const conn = connectionsRef.current[activeChatId]
    const msgObj = { sender: 'me', text, timestamp: Date.now() }
    let isQueued = false

    if (!conn || !conn.open) {
      if (!messageQueueRef.current[activeChatId]) messageQueueRef.current[activeChatId] = []
      messageQueueRef.current[activeChatId].push(text)
      isQueued = true
      attemptReconnect(activeChatId)
    } else {
      try { conn.send(text) } catch {
        if (!messageQueueRef.current[activeChatId]) messageQueueRef.current[activeChatId] = []
        messageQueueRef.current[activeChatId].push(text)
        isQueued = true
      }
    }
    setSessions(prev => ({
      ...prev,
      [activeChatId]: [...(prev[activeChatId] || []), { ...msgObj, queued: isQueued }]
    }))
    setInputValue('')
    setShowEmojiPicker(false)
    updateContactStatus(activeChatId, contacts[activeChatId]?.isOnline || false)
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(e) }

  // Queue retry loop — resends failed messages when connection restores
  useEffect(() => {
    const interval = setInterval(() => {
      Object.keys(messageQueueRef.current).forEach(pid => {
        const queue = messageQueueRef.current[pid]
        const conn  = connectionsRef.current[pid]
        if (!conn || !conn.open || !queue?.length) return
        const msg = queue[0]
        try {
          conn.send(msg)
          queue.shift()
          // Update "queued" flag in sessions for plain 1:1 messages
          try {
            const parsed = JSON.parse(msg)
            if (parsed?.type) return // group/system message — no session update needed
          } catch { /* plain string */ }
          setSessions(prev => {
            const updated = { ...prev }
            const chat = [...(updated[pid] || [])]
            for (let i = chat.length - 1; i >= 0; i--) {
              if (chat[i].text === msg && chat[i].queued) { chat[i] = { ...chat[i], queued: false }; break }
            }
            updated[pid] = chat
            return updated
          })
        } catch { /* retry next tick */ }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Periodic mesh maintenance — every 30 s, reset attempt counters and retry
  // connections to ALL group members and DM contacts.
  // This ensures that peers who were offline at group-creation time (or who
  // exhausted the 5-attempt reconnect limit) are eventually reached when they
  // come back online, without requiring a page refresh.
  useEffect(() => {
    const meshInterval = setInterval(() => {
      if (!peerRef.current || !myIdRef.current) return
      // Re-connect to every group member
      Object.values(groupsRef.current).forEach(group => {
        ;(group.members || []).forEach(pid => {
          if (pid !== myIdRef.current && (!connectionsRef.current[pid] || !connectionsRef.current[pid].open)) {
            reconnectAttemptsRef.current[pid] = 0  // reset so 5-attempt cap doesn't block us
            attemptReconnect(pid)
          }
        })
      })
      // Also re-connect to DM contacts
      Object.keys(contactsRef.current).forEach(pid => {
        if (!connectionsRef.current[pid] || !connectionsRef.current[pid].open) {
          reconnectAttemptsRef.current[pid] = 0
          attemptReconnect(pid)
        }
      })
    }, 30000)
    return () => clearInterval(meshInterval)
  }, [])

  // ── UI helpers ─────────────────────────────────────────────────────
  const handleSelectDM = (pid) => {
    setActiveChatId(pid)
    setActiveChatType('dm')
    setShowGroupInfo(false)
    setContacts(prev => ({ ...prev, [pid]: { ...prev[pid], unread: 0 } }))
  }

  const handleSelectGroup = (gid) => {
    setActiveChatId(gid)
    setActiveChatType('group')
    setShowGroupInfo(false)
    setGroups(prev => ({ ...prev, [gid]: { ...prev[gid], unread: 0 } }))
  }

  const copyId = () => {
    navigator.clipboard.writeText(myId)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const resetId = () => {
    if (peerRef.current) peerRef.current.destroy()
    setMyId(''); setScreen('setup'); setActiveChatId(null); setActiveChatType('dm')
    setInputValue(''); setCustomIdObj(''); setNewPeerId(''); setErrorObj(null)
    setShowGroupInfo(false); setShowCreateGroup(false)
  }

  const toggleMember = (pid) =>
    setSelectedMembers(prev => prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid])

  const formatTime = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // ── RENDER: Setup Screen ───────────────────────────────────────────
  const renderSetupScreen = () => (
    <div className="wa-setup-screen">
      <div className="wa-setup-card">
        <div className="wa-setup-icon">
          <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="56" height="56">
            <circle cx="30" cy="30" r="30" fill="#25D366"/>
            <path d="M30 12C20.06 12 12 20.06 12 30c0 3.19.86 6.19 2.38 8.77L12 48l9.5-2.35A17.93 17.93 0 0030 48c9.94 0 18-8.06 18-18S39.94 12 30 12zm9.18 24.82c-.38 1.08-2.24 2.08-3.06 2.14-.83.06-1.62.36-5.44-1.12-4.6-1.78-7.56-6.44-7.78-6.74-.22-.3-1.8-2.4-1.8-4.58s1.14-3.24 1.56-3.68c.38-.4.84-.5 1.12-.5.28 0 .56 0 .8.02.26.02.62-.1.96.74.38.9 1.28 3.12 1.4 3.34.12.22.2.5.04.8-.16.3-.24.5-.48.76-.24.28-.5.62-.72.84-.24.24-.48.5-.2.98.28.48 1.24 2.04 2.66 3.3 1.82 1.62 3.36 2.12 3.84 2.36.48.24.76.2 1.04-.12.28-.34 1.2-1.4 1.52-1.88.32-.48.64-.4 1.08-.24.44.16 2.8 1.32 3.28 1.56.48.24.8.36.92.56.12.2.12 1.14-.26 2.22z" fill="white"/>
          </svg>
        </div>
        <h1 className="wa-setup-title">P2P Chat</h1>
        <p className="wa-setup-sub">Choose a display name to start chatting</p>
        <form onSubmit={e => { e.preventDefault(); if (customIdObj.trim()) initializePeer(customIdObj.trim()) }} className="wa-setup-form">
          <div className="wa-input-group">
            <input
              type="text"
              placeholder="Your name (e.g. Alice)"
              value={customIdObj}
              onChange={e => setCustomIdObj(e.target.value)}
              className="wa-text-input"
              autoFocus
              maxLength={30}
            />
          </div>
          <button type="submit" className="wa-primary-btn wa-setup-btn" disabled={!customIdObj.trim()}>
            Start chatting
          </button>
        </form>
        {errorObj && <div className="wa-error-msg">{errorObj.message}</div>}
      </div>
    </div>
  )

  // ── RENDER: Sidebar ────────────────────────────────────────────────
  const renderSidebar = () => (
    <div className="wa-sidebar">
      <div className="wa-sidebar-header">
        <div className="wa-avatar wa-avatar-lg" title={myId}>{myId[0]?.toUpperCase()}</div>
        <div className="wa-sidebar-header-actions">
          <button
            className="wa-icon-btn"
            title="New Group"
            onClick={() => { setShowCreateGroup(true); setSelectedMembers([]) }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              <line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/>
            </svg>
          </button>
          <button className="wa-icon-btn" onClick={resetId} title="Change Name / Logout">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Your ID */}
      <div className="wa-connect-your-id">
        <div className="wa-your-id-label">Your P2P ID</div>
        <div className="wa-your-id-row" onClick={copyId} title="Click to copy">
          <span className="wa-your-id-value">{myId}</span>
          <button className="wa-copy-btn">
            {isCopied
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00A884" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            }
          </button>
        </div>
      </div>

      {/* New DM */}
      <div className="wa-search-bar" style={{ margin: '8px 12px 0 12px' }}>
        <input
          type="text"
          placeholder="New chat (Enter Peer ID)"
          className="wa-search-input"
          value={newPeerId}
          onChange={e => { setNewPeerId(e.target.value); setConnectError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') { connectToPeer(); setNewPeerId('') } }}
        />
        <button
          className="wa-icon-btn"
          style={{ width: '28px', height: '28px' }}
          onClick={() => { connectToPeer(); setNewPeerId('') }}
          disabled={!newPeerId.trim() || isConnecting}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
      {connectError && <div className="wa-error-msg wa-error-msg--sm">{connectError}</div>}

      {/* Contact + Group list */}
      <div className="wa-contact-list">
        {/* ── Direct Messages ── */}
        {Object.keys(contacts).length > 0 && (
          <div className="wa-section-header">Direct Messages</div>
        )}
        {Object.values(contacts)
          .sort((a, b) => b.lastActivity - a.lastActivity)
          .map(contact => (
            <div
              key={contact.id}
              className={`wa-contact-item ${activeChatType === 'dm' && activeChatId === contact.id ? 'active' : ''}`}
              onClick={() => handleSelectDM(contact.id)}
            >
              <div className="wa-avatar">{contact.displayName[0]?.toUpperCase()}</div>
              <div className="wa-contact-info">
                <div className="wa-contact-row">
                  <span className="wa-contact-name">{contact.displayName}</span>
                  {sessions[contact.id]?.length > 0 && (
                    <span className="wa-contact-time">
                      {formatTime(sessions[contact.id][sessions[contact.id].length - 1].timestamp)}
                    </span>
                  )}
                </div>
                <div className="wa-contact-row">
                  <span className="wa-contact-preview">
                    <span className={`wa-status-indicator ${contact.isOnline ? 'online' : 'offline'}`}/>
                    {sessions[contact.id]?.length > 0
                      ? sessions[contact.id][sessions[contact.id].length - 1].text.substring(0, 30)
                      : 'Start chatting...'}
                  </span>
                  {contact.unread > 0 && <span className="wa-contact-unread">{contact.unread}</span>}
                </div>
              </div>
            </div>
          ))
        }

        {/* ── Groups ── */}
        {Object.keys(groups).length > 0 && (
          <div className="wa-section-header">Groups</div>
        )}
        {Object.values(groups)
          .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))
          .map(group => (
            <div
              key={group.id}
              className={`wa-contact-item ${activeChatType === 'group' && activeChatId === group.id ? 'active' : ''}`}
              onClick={() => handleSelectGroup(group.id)}
            >
              <div className="wa-avatar wa-group-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                </svg>
              </div>
              <div className="wa-contact-info">
                <div className="wa-contact-row">
                  <span className="wa-contact-name">{group.name}</span>
                  {groupSessions[group.id]?.length > 0 && (
                    <span className="wa-contact-time">
                      {formatTime(groupSessions[group.id][groupSessions[group.id].length - 1].timestamp)}
                    </span>
                  )}
                </div>
                <div className="wa-contact-row">
                  <span className="wa-contact-preview">
                    <span className="wa-group-count-badge">{group.members.length}</span>
                    {groupSessions[group.id]?.length > 0
                      ? ' ' + groupSessions[group.id][groupSessions[group.id].length - 1].text.substring(0, 28)
                      : ' No messages yet'}
                  </span>
                  {group.unread > 0 && <span className="wa-contact-unread">{group.unread}</span>}
                </div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )

  // ── RENDER: Welcome panel ──────────────────────────────────────────
  const renderWelcomePanel = () => (
    <div className="wa-welcome-panel-container">
      <div className="wa-welcome-panel">
        <div className="wa-welcome-icon">
          <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" width="120" height="120">
            <circle cx="60" cy="60" r="60" fill="#E9EDEF"/>
            <path d="M60 28C42.33 28 28 42.33 28 60c0 5.72 1.54 11.1 4.26 15.72L28 92l16.72-4.24A31.87 31.87 0 0060 92c17.67 0 32-14.33 32-32S77.67 28 60 28z" fill="#C9CDD0"/>
          </svg>
        </div>
        <h2 className="wa-welcome-title">P2P Chat</h2>
        <p className="wa-welcome-desc">Select a contact to chat 1:1, or create a group for many-to-many conversations. All messages are private and encrypted via WebRTC.</p>
        <div className="wa-e2e-note" style={{ marginTop: '30px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          End-to-end encrypted via WebRTC
        </div>
      </div>
    </div>
  )

  // ── RENDER: Chat panel (DM + Group) ────────────────────────────────
  const renderChatPanel = () => {
    const isDM          = activeChatType === 'dm'
    const activeContact = isDM ? contacts[activeChatId] : null
    const activeGroup   = !isDM ? groups[activeChatId] : null
    const activeMessages = isDM
      ? (sessions[activeChatId] || [])
      : (groupSessions[activeChatId] || [])
    const headerName = isDM
      ? (activeContact?.displayName || activeChatId)
      : (activeGroup?.name || activeChatId)
    const headerSub = isDM
      ? (activeContact?.isOnline ? 'Online' : 'Offline')
      : `${activeGroup?.members?.length || 0} members`

    return (
      <div className="wa-chat-container">
        {/* Header */}
        <div className="wa-chat-header">
          <button className="wa-icon-btn wa-mobile-back-btn" onClick={() => setActiveChatId(null)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          {isDM
            ? <div className="wa-chat-avatar">{activeContact?.displayName[0]?.toUpperCase()}</div>
            : <div className="wa-chat-avatar wa-group-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                </svg>
              </div>
          }
          <div className="wa-chat-header-info" style={{ flex: 1 }}>
            <div className="wa-chat-peer-name">{headerName}</div>
            <div className={`wa-chat-peer-status ${isDM && activeContact?.isOnline ? 'online' : ''}`}>
              {headerSub}
            </div>
          </div>
          {!isDM && (
            <button
              className={`wa-icon-btn ${showGroupInfo ? 'wa-icon-btn--active' : ''}`}
              onClick={() => setShowGroupInfo(v => !v)}
              title="Group Info"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </button>
          )}
        </div>

        {/* Messages area */}
        <div className="wa-messages-area" onClick={() => setShowEmojiPicker(false)}>
          {activeMessages.length === 0 && (
            <div className="wa-no-messages">
              <div className="wa-no-messages-badge">🔒 Messages are end-to-end encrypted</div>
            </div>
          )}
          {activeMessages.map((msg, i) => {
            const isMe = msg.sender === 'me'
            return (
              <div key={i} className={`wa-message-row ${isMe ? 'me' : 'peer'}`}>
                <div className={`wa-bubble ${isMe ? 'wa-bubble--me' : 'wa-bubble--peer'} ${msg.queued ? 'wa-bubble--queued' : ''}`}>
                  {/* Sender label for group chats */}
                  {!isDM && !isMe && (
                    <div className="wa-bubble-sender" style={{ color: senderColor(msg.senderName || msg.sender) }}>
                      {msg.senderName || msg.sender}
                    </div>
                  )}
                  <p className="wa-bubble-text">{msg.text}</p>
                  <div className="wa-bubble-meta">
                    <span className="wa-bubble-time">{formatTime(msg.timestamp)}</span>
                    {isMe && (
                      <span className="wa-bubble-status">
                        {msg.queued
                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8696A0" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#53BDEB" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/><polyline points="20 6 9 17 4 12" transform="translate(-4 0)"/></svg>
                        }
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef}/>
        </div>

        {/* Emoji tray */}
        {showEmojiPicker && (
          <div className="wa-emoji-tray">
            {EMOJIS.map(emoji => (
              <button key={emoji} className="wa-emoji-btn" onClick={() => sendMessage(null, emoji)}>{emoji}</button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div className="wa-input-bar">
          <button
            className={`wa-icon-btn wa-emoji-toggle ${showEmojiPicker ? 'active' : ''}`}
            onClick={e => { e.stopPropagation(); setShowEmojiPicker(v => !v) }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 13s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </button>
          <div className="wa-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              placeholder={
                isDM
                  ? (activeContact?.isOnline ? 'Type a message' : 'Type a message (queued ...)')
                  : 'Type a group message'
              }
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={MAX_MESSAGE_LENGTH}
              className="wa-message-input"
            />
          </div>
          <button className="wa-send-btn" onClick={sendMessage} disabled={!inputValue.trim()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // ── RENDER: Group Info panel ───────────────────────────────────────
  const renderGroupInfo = () => {
    const group = groups[activeChatId]
    if (!group) return null
    const isCreator = group.createdBy === myId

    return (
      <div className="wa-group-info-panel">
        <div className="wa-group-info-header">
          <span className="wa-group-info-title">Group Info</span>
          <button className="wa-icon-btn" onClick={() => setShowGroupInfo(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="wa-group-info-body">
          <div className="wa-group-info-avatar">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <div className="wa-group-info-name">{group.name}</div>
          <div className="wa-group-info-meta">
            {group.members.length} members · Created by <strong>{group.createdBy}</strong>
          </div>

          {/* Member list */}
          <div className="wa-group-section-label">Members</div>
          <div className="wa-group-members-list">
            {group.members.map(pid => (
              <div key={pid} className="wa-group-member-row">
                <div className="wa-avatar wa-group-member-avatar">{pid[0]?.toUpperCase()}</div>
                <div className="wa-group-member-info">
                  <span className="wa-group-member-name">
                    {pid}{pid === myId ? ' (You)' : ''}{pid === group.createdBy ? ' 👑' : ''}
                  </span>
                  {pid !== myId && (
                    <span className={`wa-group-member-status ${contacts[pid]?.isOnline ? 'online' : ''}`}>
                      {contacts[pid]?.isOnline ? 'Online' : 'Offline'}
                    </span>
                  )}
                </div>
                {isCreator && pid !== myId && (
                  <button
                    className="wa-remove-member-btn"
                    onClick={() => removeMemberFromGroup(activeChatId, pid)}
                    title="Remove member"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add member */}
          <div className="wa-group-section-label" style={{ marginTop: 16 }}>Add Member</div>
          <div className="wa-add-member-row">
            <input
              type="text"
              className="wa-add-member-input"
              placeholder="Enter Peer ID"
              value={addMemberInput}
              onChange={e => { setAddMemberInput(e.target.value); setAddMemberError('') }}
              onKeyDown={e => { if (e.key === 'Enter') addMemberToGroup() }}
              maxLength={40}
            />
            <button className="wa-add-member-btn" onClick={addMemberToGroup} disabled={!addMemberInput.trim()}>
              Add
            </button>
          </div>
          {addMemberError && <div className="wa-add-member-error">{addMemberError}</div>}

          {/* Leave group */}
          <button className="wa-leave-group-btn" onClick={() => leaveGroup(activeChatId)}>
            Leave Group
          </button>
        </div>
      </div>
    )
  }

  // ── RENDER: Create Group modal ─────────────────────────────────────
  const renderCreateGroupModal = () => (
    <div className="wa-modal-overlay" onClick={() => setShowCreateGroup(false)}>
      <div className="wa-modal-card" onClick={e => e.stopPropagation()}>
        <div className="wa-modal-header">
          <span className="wa-modal-title">New Group</span>
          <button className="wa-icon-btn" onClick={() => setShowCreateGroup(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <input
          type="text"
          className="wa-modal-input"
          placeholder="Group name (e.g. Team Alpha)"
          value={newGroupName}
          onChange={e => setNewGroupName(e.target.value)}
          autoFocus
          maxLength={40}
        />
        <div className="wa-modal-section-label">Select Members</div>
        {Object.keys(contacts).length === 0 ? (
          <p className="wa-modal-empty">No contacts yet. Add a peer first using the search bar.</p>
        ) : (
          <div className="wa-modal-member-list">
            {Object.values(contacts).map(c => (
              <label key={c.id} className={`wa-modal-member-row ${selectedMembers.includes(c.id) ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(c.id)}
                  onChange={() => toggleMember(c.id)}
                  className="wa-modal-checkbox"
                />
                <div className="wa-avatar" style={{ width: 34, height: 34, fontSize: 13, flexShrink: 0 }}>
                  {c.displayName[0]?.toUpperCase()}
                </div>
                <span className="wa-modal-member-name">{c.displayName}</span>
                <span className={`wa-status-indicator ${c.isOnline ? 'online' : 'offline'}`} style={{ marginLeft: 'auto' }}/>
              </label>
            ))}
          </div>
        )}
        <button
          className="wa-primary-btn wa-modal-create-btn"
          onClick={createGroup}
          disabled={!newGroupName.trim() || selectedMembers.length === 0}
        >
          {selectedMembers.length > 0
            ? `Create Group · ${selectedMembers.length} member${selectedMembers.length > 1 ? 's' : ''}`
            : 'Select at least 1 member'}
        </button>
      </div>
    </div>
  )

  // ── Root render ────────────────────────────────────────────────────
  return (
    <div className="wa-app">
      {screen === 'setup' && renderSetupScreen()}
      {screen === 'main' && (
        <div className="wa-main-layout">
          {renderSidebar()}
          <div className={`wa-main-content ${activeChatId ? 'active' : ''}`}>
            {activeChatId
              ? <div className="wa-chat-with-info">
                  {renderChatPanel()}
                  {activeChatType === 'group' && showGroupInfo && renderGroupInfo()}
                </div>
              : renderWelcomePanel()
            }
          </div>
        </div>
      )}
      {showCreateGroup && renderCreateGroupModal()}
    </div>
  )
}

export default App
