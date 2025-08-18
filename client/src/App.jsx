import React, { useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import axios from 'axios'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000'

export default function App() {
  const socket = useMemo(() => io(SERVER_URL, { autoConnect: false, withCredentials: true }), [])

  const [roomId, setRoomId] = useState('room-1')
  const [username, setUsername] = useState('')
  const [userId, setUserId] = useState('')
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState([])
  const [presence, setPresence] = useState([])
  const [text, setText] = useState('')
  const typingTimerRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    const onAck = () => socket.emit('room:join', { roomId })
    const onRecent = ({ messages: recent }) => setMessages(recent)
    const onNew = (msg) => setMessages((prev) => [...prev, msg])
    const onPresenceUpdate = ({ users }) => setPresence(users)
    const onTyping = ({ username: u }) => {
      // Could show per-user typing, we keep global banner minimal
    }
    const onStopTyping = () => {}

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('user:ack', onAck)
    socket.on('messages:recent', onRecent)
    socket.on('message:new', onNew)
    socket.on('presence:update', onPresenceUpdate)
    socket.on('typing', onTyping)
    socket.on('stop_typing', onStopTyping)
    socket.on('connect_error', (e) => console.error('connect_error', e?.message || e))

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('user:ack', onAck)
      socket.off('messages:recent', onRecent)
      socket.off('message:new', onNew)
      socket.off('presence:update', onPresenceUpdate)
      socket.off('typing', onTyping)
      socket.off('stop_typing', onStopTyping)
      socket.disconnect()
    }
  }, [roomId, socket])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleConnect = () => {
    const uid = userId.trim() || `guest-${Math.random().toString(36).slice(2, 8)}`
    const uname = username.trim() || 'Guest'
    setUserId(uid)
    setUsername(uname)
    if (!socket.connected) {
      socket.connect()
      socket.emit('user:init', { userId: uid, username: uname })
    } else {
      socket.emit('room:join', { roomId })
    }
  }

  const handleLeave = () => {
    if (!roomId) return
    socket.emit('room:leave', { roomId })
    setMessages([])
    setPresence([])
  }

  const sendMessage = async () => {
    if (!text.trim() || !roomId) return
    socket.emit('message:send', { roomId, text })
    setText('')
    socket.emit('stop_typing', { roomId })
  }

  const startTyping = () => {
    if (!roomId) return
    socket.emit('typing', { roomId })
    clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      socket.emit('stop_typing', { roomId })
    }, 1500)
  }

  return (
    <div className="app">
      <div className="sidebar">
        <h1>Chatbot</h1>
        <div className="group">
          <label>Room</label>
          <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="room-1" />
        </div>
        <div className="group">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Alice" />
        </div>
        <div className="group">
          <label>User Id</label>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="alice-123" />
        </div>
        <button onClick={handleConnect} disabled={connected}>Connect</button>
        <button onClick={handleLeave} disabled={!connected}>Leave</button>

        <h2>Presence</h2>
        <ul className="presence">
          {presence.map((u) => (
            <li key={u.userId} className={`presence-item ${u.status === 'online' ? 'online' : 'offline'}`}>
              <span className="dot" />
              <span className="name">{u.username}</span>
              {u.typing && <span className="badge">typing…</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="chat">
        <div className="messages">
          {messages.map((m) => (
            <div className="message" key={m._id || `${m.userId}-${m.createdAt}`}>
              <div className="meta">{m.username} • {new Date(m.createdAt || Date.now()).toLocaleTimeString()}</div>
              <div>{m.text}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="composer">
          <input value={text} onChange={(e) => setText(e.target.value)} onInput={startTyping} placeholder="Type a message…" />
          <button onClick={sendMessage}>Send</button>
        </div>
      </div>
    </div>
  )
}


