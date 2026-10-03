'use client';

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:4000';

export default function Home() {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState([]);
  const [talking, setTalking] = useState(false);
  const [remoteTalking, setRemoteTalking] = useState(null);
  const [status, setStatus] = useState('Ready');

  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const audioElsRef = useRef(new Map());

  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, []);

  async function getMic() {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    stream.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    localStreamRef.current = stream;
    return stream;
  }

  function createPeer(remoteSocketId, initiator) {
    if (peersRef.current.has(remoteSocketId)) {
      return peersRef.current.get(remoteSocketId);
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('ice-candidate', {
          target: remoteSocketId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      let audio = audioElsRef.current.get(remoteSocketId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audio.playsInline = true;
        audioElsRef.current.set(remoteSocketId, audio);
      }
      audio.srcObject = event.streams[0];
      audio.play().catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        pc.close();
        peersRef.current.delete(remoteSocketId);
      }
    };

    peersRef.current.set(remoteSocketId, pc);

    if (initiator) {
      setTimeout(async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketRef.current?.emit('offer', {
            target: remoteSocketId,
            sdp: pc.localDescription,
          });
        } catch (error) {
          console.error(error);
        }
      }, 100);
    }

    return pc;
  }

  async function joinRoom() {
    if (!name.trim() || !room.trim()) {
      setStatus('Enter your name and room code.');
      return;
    }

    try {
      setStatus('Requesting microphone...');
      await getMic();

      const socket = io(SIGNALING_URL, {
        transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        setStatus('Connected');
        socket.emit('join-room', {
          room: room.trim().toUpperCase(),
          name: name.trim(),
        });
        setJoined(true);
      });

      socket.on('disconnect', () => {
        setConnected(false);
        setStatus('Disconnected');
      });

      socket.on('room-users', (list) => {
        setUsers(list);
      });

      socket.on('existing-users', async (list) => {
        for (const user of list) {
          createPeer(user.id, true);
        }
      });

      socket.on('user-joined', (user) => {
        setUsers((prev) => {
          if (prev.some((u) => u.id === user.id)) return prev;
          return [...prev, user];
        });
        createPeer(user.id, false);
      });

      socket.on('offer', async ({ from, sdp }) => {
        const pc = createPeer(from, false);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', {
          target: from,
          sdp: pc.localDescription,
        });
      });

      socket.on('answer', async ({ from, sdp }) => {
        const pc = peersRef.current.get(from);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      });

      socket.on('ice-candidate', async ({ from, candidate }) => {
        const pc = peersRef.current.get(from);
        if (!pc || !candidate) return;
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('ICE error', error);
        }
      });

      socket.on('talking', ({ id, name, active }) => {
        setRemoteTalking(active ? { id, name } : null);
      });

      socket.on('user-left', ({ id }) => {
        const pc = peersRef.current.get(id);
        if (pc) pc.close();
        peersRef.current.delete(id);

        const audio = audioElsRef.current.get(id);
        if (audio) {
          audio.srcObject = null;
          audioElsRef.current.delete(id);
        }

        setUsers((prev) => prev.filter((u) => u.id !== id));
        setRemoteTalking((prev) => (prev?.id === id ? null : prev));
      });
    } catch (error) {
      console.error(error);
      setStatus('Microphone permission failed. Use HTTPS or localhost and allow microphone access.');
    }
  }

  function startTalking() {
    if (!localStreamRef.current || talking) return;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    setTalking(true);
    socketRef.current?.emit('talking', { active: true });
  }

  function stopTalking() {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    setTalking(false);
    socketRef.current?.emit('talking', { active: false });
  }

  function cleanupAll() {
    stopTalking();

    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();

    audioElsRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    audioElsRef.current.clear();

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    socketRef.current?.disconnect();
    socketRef.current = null;
  }

  function leaveRoom() {
    cleanupAll();
    setJoined(false);
    setConnected(false);
    setUsers([]);
    setTalking(false);
    setRemoteTalking(null);
    setStatus('Ready');
  }

  function randomRoom() {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    setRoom(code);
  }

  if (!joined) {
    return (
      <main className="page-shell">
        <section className="card join-card">
          <div className="logo-badge">VT</div>
          <p className="eyebrow">Internet Walkie-Talkie</p>
          <h1>Voki Talk</h1>
          <p className="muted">
            Create a room, share the code, and hold the button to talk from anywhere with internet.
          </p>

          <div className="form-stack">
            <label>
              Your name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ebenezer"
                maxLength={30}
              />
            </label>

            <label>
              Room code
              <div className="room-row">
                <input
                  value={room}
                  onChange={(e) => setRoom(e.target.value.toUpperCase())}
                  placeholder="ROOM01"
                  maxLength={20}
                />
                <button className="secondary-btn" onClick={randomRoom} type="button">
                  Generate
                </button>
              </div>
            </label>

            <button className="primary-btn" onClick={joinRoom}>
              Join room
            </button>
          </div>

          <p className="status-text">{status}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="card talk-card">
        <div className="topbar">
          <div>
            <p className="eyebrow">Room</p>
            <h2>{room.toUpperCase()}</h2>
          </div>
          <div className={`connection-pill ${connected ? 'online' : ''}`}>
            <span /> {connected ? 'Online' : 'Offline'}
          </div>
        </div>

        <div className="speaker-box">
          <p className="muted small">Now speaking</p>
          <strong>
            {talking ? `${name} (You)` : remoteTalking?.name || 'Nobody'}
          </strong>
        </div>

        <button
          className={`ptt-button ${talking ? 'active' : ''}`}
          onMouseDown={startTalking}
          onMouseUp={stopTalking}
          onMouseLeave={stopTalking}
          onTouchStart={(e) => {
            e.preventDefault();
            startTalking();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            stopTalking();
          }}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Hold to talk"
        >
          <span className="mic-icon">🎙️</span>
          <span>{talking ? 'Talking...' : 'Hold to Talk'}</span>
        </button>

        <p className="helper">Press and hold while speaking. Release when finished.</p>

        <div className="users-panel">
          <div className="users-title">
            <strong>People in room</strong>
            <span>{users.length}</span>
          </div>

          <div className="users-list">
            {users.map((user) => (
              <div className="user-row" key={user.id}>
                <div className="avatar">{(user.name || '?').slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>{user.name}</strong>
                  <p>{user.id === socketRef.current?.id ? 'You' : 'Connected'}</p>
                </div>
                <span className="dot" />
              </div>
            ))}
          </div>
        </div>

        <button className="leave-btn" onClick={leaveRoom}>
          Leave room
        </button>
      </section>
    </main>
  );
}
