import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useChat,
  useRoomContext,
  useParticipants
} from "@livekit/components-react";
import {
  ExternalE2EEKeyProvider
} from "livekit-client";
import "@livekit/components-styles";
import "./style.css";

const API = "http://localhost:5000";

function RoomMixLiveMeeting({
  token,
  meeting,
  onDisconnected,
  children,
}) {

  const [e2eeReady, setE2eeReady] = useState(false);
  const [keyProvider] = useState(
    () => new ExternalE2EEKeyProvider()
  );

  const [roomOptions] = useState(() => ({
    encryption: {
      keyProvider,
      worker: new Worker(
        new URL(
          "livekit-client/e2ee-worker",
          import.meta.url
        )
      ),
    },
  }));

  useEffect(() => {
    let cancelled = false;

    const setupEncryption = async () => {
      try {
        if (!meeting?.e2eeKey) {
          console.error("Room Mix: E2EE key missing");
          return;
        }

        await keyProvider.setKey(meeting.e2eeKey);

        if (!cancelled) {
          setE2eeReady(true);
        }
      } catch (error) {
        console.error(
          "Room Mix E2EE setup error:",
          error
        );
      }
    };

    setupEncryption();

    return () => {
      cancelled = true;
    };
  }, [meeting?.e2eeKey, keyProvider]);

  if (!e2eeReady) {
    return (
      <div className="roommix-e2ee-loading">
        Securing meeting…
      </div>
    );
  }

   return (
  <LiveKitRoom
    token={token}
    serverUrl={meeting.livekitUrl}
    connect
    video
    audio
    options={roomOptions}
    onDisconnected={onDisconnected}
  >
    {children}
  </LiveKitRoom>
);
}


function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [meeting, setMeeting] = useState(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
      const [meetingLocked, setMeetingLocked] = useState(false);
const toggleMeetingLock = async () => {
  if (!meeting?.meetingId || !meeting?.participantIdentity) {
    console.error("Meeting lock information is missing:", meeting);
    alert("Unable to lock meeting. Please reconnect.");
    return;
  }

  if (meeting.isHost !== true) {
    alert("Only the host can lock or unlock the meeting.");
    return;
  }

  const shouldLock = !meetingLocked;

  try {
    const response = await fetch(
      `${API}/api/meetings/${encodeURIComponent(
        meeting.meetingId
      )}/${shouldLock ? "lock" : "unlock"}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requesterIdentity: meeting.participantIdentity,
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.message ||
        data.error ||
        `Unable to ${shouldLock ? "lock" : "unlock"} meeting`
      );
    }

    setMeetingLocked(data.locked === true);

    setMeeting((prev) => ({
      ...prev,
      locked: data.locked === true,
    }));

    console.log(
      `Room Mix: meeting ${data.locked ? "locked" : "unlocked"}`
    );
  } catch (error) {
    console.error("Room Mix meeting lock error:", error);
    alert(error.message || "Unable to change meeting lock status.");
  }
};
  const endMeeting = async () => {
  if (!meeting?.meetingId || !meeting?.participantIdentity) {
    alert("Unable to end meeting. Please reconnect.");
    return;
  }

  if (meeting.isHost !== true) {
    alert("Only the host can end the meeting.");
    return;
  }

  const confirmed = window.confirm(
    "Are you sure you want to end this meeting for everyone?"
  );

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(
      `${API}/api/meetings/${encodeURIComponent(
        meeting.meetingId
      )}/end`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requesterIdentity: meeting.participantIdentity,
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.message || "Unable to end meeting"
      );
    }

    setToken("");
    setMeeting(null);
    setChatOpen(false);
    setParticipantsOpen(false);
    setMeetingLocked(false);
    setPage("ended");

  } catch (error) {
    console.error("Room Mix end meeting error:", error);
    alert(error.message || "Unable to end meeting.");
  }
};
    const [chatOpen, setChatOpen] = useState(false);
    const [participantsOpen, setParticipantsOpen] = useState(false);
  meeting?.locked === true



  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [meetingForm, setMeetingForm] = useState({
    name: "",
    passcode: "",
    meetingId: "",
    isHost: false,
  });

  useEffect(() => {
  const savedUser = localStorage.getItem("roommix_user");

  if (savedUser) {
    try {
      setUser(JSON.parse(savedUser));
    } catch {
      localStorage.removeItem("roommix_user");
    }
  }

  const params = new URLSearchParams(window.location.search);

  const sharedMeeting = params.get("meeting");

  if (sharedMeeting) {
    setMeetingForm((prev) => ({
      ...prev,
      meetingId: sharedMeeting,
    }));

    setPage("join");
  }
}, []);

  const saveUser = (data) => {
    setUser(data);
    localStorage.setItem("roommix_user", JSON.stringify(data));
  };

  const logout = () => {
    localStorage.removeItem("roommix_user");
    setUser(null);
    setPage("home");
  };
  const createMeeting = async () => {
    setError("");

    try {
      const response = await fetch(`${API}/api/meetings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: meetingForm.name.trim() || "Room Mix Meeting",
          hostName: user?.name || "Guest",
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || data.error || "Unable to create meeting");
      }

      setMeeting({
        ...data,
        participantIdentity: data.hostIdentity,
        isHost: true,
      });
      setMeetingLocked(data.locked === true);

      setMeetingForm((prev) => ({
        ...prev,
        meetingId: data.meetingId,
        passcode: data.passcode || "",
        isHost: true,
      }));

      setPage("prejoin");
    } catch (err) {
      console.error("Room Mix create meeting error:", err);
      setError(err.message || "Unable to create meeting");
    }
  };

  const joinMeeting = async () => {
    setError("");

    if (!meetingForm.meetingId.trim()) {
      setError("Please enter a meeting ID.");
      return;
    }

    try {
      const response = await fetch(`${API}/api/meetings/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meetingId: meetingForm.meetingId.trim(),
          name: user?.name || "Guest",
          passcode: meetingForm.passcode,
          isHost: false,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Unable to join meeting");
      }

      const data = await response.json();

setMeeting({
  ...data,
  isHost: false,
  isCoHost: data.isCoHost === true,
});
setMeetingLocked(data.locked === true);

setPage("prejoin");

     
    } catch (err) {
      setError(err.message);
    }
  };

  const enterMeeting = async () => {
    setError("");

    try {
      const response = await fetch(`${API}/api/meetings/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meetingId: meeting.meetingId,
          identity: meeting.participantIdentity,
          name: user?.name || "Guest",
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to generate meeting access");
      }

      const data = await response.json();
      console.log("ROOM MIX ENTER DATA:", {
  meeting,
  token: data.token ? "TOKEN_RECEIVED" : "NO_TOKEN",
  livekitUrl: data.url,
  roomName: data.roomName,
  meetingId: meeting?.meetingId,
  participantIdentity: meeting?.participantIdentity,
});
      setToken(data.token);
      setMeeting((prev) => ({
        ...prev,
        livekitUrl: data.url,
        e2eeKey: data.e2eeKey,
      }));

      setPage("meeting");
    } catch (err) {
      setError(err.message);
    }
  };
  

  if (page === "meeting" && token && meeting) {
  return (
    <RoomMixLiveMeeting
  token={token}
  meeting={meeting}
  onDisconnected={() => {
    setToken("");
    setMeeting(null);
    setChatOpen(false);
    setPage("ended");
  }}
>
      <div className="meeting-wrapper">

        <VideoConference />

        <RoomAudioRenderer />
    {meeting?.isHost === true && (
  <button
    type="button"
    className="roommix-lock-button"
    onClick={toggleMeetingLock}
    title={meetingLocked ? "Unlock meeting" : "Lock meeting"}
  >
    <span>{meetingLocked ? "🔓" : "🔒"}</span>
    <span>
      {meetingLocked ? "Unlock" : "Lock Meeting"}
    </span>
  </button>

)}
{meeting?.isHost === true && (
  <button
    type="button"
    className="roommix-end-meeting-button"
    onClick={endMeeting}
  >
    <span>⛔</span>
    <span>End Meeting</span>
  </button>
)}
        {/* HOST PARTICIPANTS */}
{/* PARTICIPANTS */}

{!participantsOpen && (
  
  <button
    type="button"
    className="roommix-participants-launcher"
    onClick={() => setParticipantsOpen(true)}
  >
    <span>👥</span>
    <span>Participants</span>
  </button>
)}

{participantsOpen && (
  <div className="roommix-host-panel-wrapper">
   <div className="roommix-host-panel-top">
  <strong>Participants</strong>

 

  <button
    type="button"
    onClick={() => setParticipantsOpen(false)}
    aria-label="Close participants"
  >
    ×
  </button>
</div>

    <HostParticipantsPanel
      isHost={meeting.isHost === true}
      
    />
  </div>
)}

        {/* ROOM MIX CUSTOM CHAT */}
        {chatOpen && (
          <div className="roommix-custom-chat">

            <div className="roommix-custom-chat-header">
              <strong>Messages</strong>

              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Close chat"
              >
                ×
              </button>
            </div>

            <RoomMixChat />

          </div>
        )}

        {/* ROOM MIX CHAT BUTTON */}
        {!chatOpen && (
          <button
            type="button"
            className="roommix-chat-launcher"
            onClick={() => setChatOpen(true)}
          >
            <span>💬</span>
            <span>Chat</span>
          </button>
        )}


        {meeting?.isHost === true && (
  <button
    type="button"
    className="roommix-lock-button"
    onClick={toggleMeetingLock}
    title={meetingLocked ? "Unlock meeting" : "Lock meeting"}
  >
    <span>
      {meetingLocked ? "🔓" : "🔒"}
    </span>

    <span>
      {meetingLocked ? "Unlock" : "Lock Meeting"}
    </span>
  </button>
)}

      </div>
    </RoomMixLiveMeeting>
  );
}

  return (
    <div className="app">
      <Navbar
        user={user}
        onHome={() => setPage(user ? "dashboard" : "home")}
        onLogin={() => setPage("login")}
        onRegister={() => setPage("register")}
        onLogout={logout}
      />

      <main>
        {page === "home" && (
          <Home
            user={user}
            onCreate={() => setPage(user ? "create" : "login")}
            onJoin={() => setPage("join")}
            onRegister={() => setPage("register")}
          />
        )}

        {page === "register" && (
          <AuthPage
            type="register"
            form={authForm}
            setForm={setAuthForm}
            onSuccess={(newUser) => {
              saveUser(newUser);
              setPage("dashboard");
            }}
            onLogin={() => setPage("login")}
            setError={setError}
            error={error}
          />
        )}

        {page === "login" && (
          <AuthPage
            type="login"
            form={authForm}
            setForm={setAuthForm}
            onSuccess={(loggedUser) => {
              saveUser(loggedUser);
              setPage("dashboard");
            }}
            onRegister={() => setPage("register")}
            setError={setError}
            error={error}
          />
        )}

        {page === "dashboard" && (
          <Dashboard
            user={user}
            onCreate={() => setPage("create")}
            onJoin={() => setPage("join")}
          />
        )}

        {page === "create" && (
          <CreateMeeting
            form={meetingForm}
            setForm={setMeetingForm}
            onCreate={createMeeting}
            onBack={() => setPage("dashboard")}
            error={error}
          />
        )}

        {page === "join" && (
          <JoinMeeting
            form={meetingForm}
            setForm={setMeetingForm}
            onJoin={joinMeeting}
            onBack={() => setPage(user ? "dashboard" : "home")}
            error={error}
          />
        )}

        {page === "prejoin" && (
          <PreJoin
            meeting={meeting}
            user={user}
            onJoin={enterMeeting}
            onBack={() => setPage(user ? "dashboard" : "home")}
            error={error}
          />
        )}

        {page === "ended" && (
          <MeetingEnded
            onDashboard={() => setPage(user ? "dashboard" : "home")}
          />
        )}
      </main>
    </div>
  );
}
function formatFileSize(bytes) {
  if (!bytes) return "0 B";

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function RoomMixChat() {
  const { chatMessages, send, isSending } = useChat();
const room = useRoomContext();
  const [message, setMessage] = React.useState("");
  const [showEmoji, setShowEmoji] = React.useState(false);
const [sendingFile, setSendingFile] = React.useState(false);
const [fileInputKey, setFileInputKey] = React.useState(0);
const [files, setFiles] = React.useState([]);
React.useEffect(() => {
  const handleIncomingFile = async (reader, participantInfo) => {
    try {
      const info = reader.info;

      const chunks = await reader.readAll();

      const blob = new Blob(chunks, {
        type: info.mimeType || "application/octet-stream",
      });

      const url = URL.createObjectURL(blob);

      setFiles((current) => [
        ...current,
        {
          id: info.id,
          name: info.name || "Shared file",
          size: info.size || blob.size,
          type: info.mimeType || "application/octet-stream",
          url,
          sender:
            participantInfo?.name ||
            participantInfo?.identity ||
            "Participant",
          timestamp: Date.now(),
        },
      ]);

      console.log(
        `Room Mix received file: ${info.name}`
      );

    } catch (error) {
      console.error(
        "Room Mix file receive failed:",
        error
      );
    }
  };

  room.registerByteStreamHandler(
    "roommix-files",
    handleIncomingFile
  );

  return () => {
    room.unregisterByteStreamHandler(
      "roommix-files"
    );
  };
}, [room]);
  const emojis = [
    "😀",
    "😂",
    "😍",
    "🥰",
    "😎",
    "👍",
    "👏",
    "❤️",
    "🔥",
    "🎉",
    "🙌",
    "😊",
    "😢",
    "😮",
    "🤔",
    "🙏",
  ];

  const sendMessage = async () => {
    const text = message.trim();

    if (!text || isSending) return;

    try {
      await send(text);
      setMessage("");
      setShowEmoji(false);
    } catch (error) {
      console.error("Room Mix chat error:", error);
    }
  };

  const addEmoji = (emoji) => {
    setMessage((current) => current + emoji);
  };
  const handleFileSelect = async (event) => {
  const file = event.target.files?.[0];

  if (!file) return;

  try {
    setSendingFile(true);

    await room.localParticipant.sendFile(file, {
      topic: "roommix-files",
      mimeType: file.type,
      onProgress: (progress) => {
        console.log(
          `Room Mix file upload: ${Math.round(progress * 100)}%`
        );
      },
    });

    // Create a local copy so the sender also sees
    // the file inside their own chat.
    const localUrl = URL.createObjectURL(file);

    setFiles((current) => [
      ...current,
      {
        id: `local-${Date.now()}-${file.name}`,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        url: localUrl,
        sender:
          room.localParticipant.name ||
          room.localParticipant.identity ||
          "You",
        timestamp: Date.now(),
        isLocal: true,
      },
    ]);

    console.log("File sent:", file.name);

  } catch (error) {
    console.error("Room Mix file send failed:", error);
    alert("Unable to send this file.");
  } finally {
    setSendingFile(false);

    setFileInputKey((key) => key + 1);
  }
};
  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="roommix-chat-content">

      <div className="roommix-chat-messages">
        <div className="roommix-chat-messages">

  {files.length === 0 && chatMessages.length === 0 ? (
    <div className="roommix-chat-empty">
      <div className="roommix-chat-empty-icon">
        💬
      </div>

      <strong>No messages yet</strong>

      <span>
        Start the conversation with your participants.
      </span>
    </div>
  ) : (
    <>
      {files.map((file) => (
        <div
          className="roommix-file-message"
          key={file.id}
        >
          <div className="roommix-file-icon">
            📎
          </div>

          <div className="roommix-file-info">
            <strong>{file.name}</strong>

            <span>
              {file.sender} ·{" "}
              {formatFileSize(file.size)}
            </span>

            <a
              href={file.url}
              download={file.name}
              className="roommix-file-download"
            >
              Download
            </a>
          </div>
        </div>
      ))}

      {chatMessages.map((msg, index) => {
        const sender =
          msg.from?.name ||
          msg.from?.identity ||
          "Guest";

        const time = new Date(
          Number(msg.timestamp)
        ).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        });

        return (
          <div
            className="roommix-message"
            key={`${msg.timestamp}-${index}`}
          >
            <div className="roommix-message-top">
              <strong>{sender}</strong>

              <span>{time}</span>
            </div>

            <div className="roommix-message-text">
              {msg.message}
            </div>
          </div>
        );
      })}
    </>
  )}

</div>
      </div>

      <div className="roommix-chat-composer">

        {showEmoji && (
          <div className="roommix-emoji-picker">
            {emojis.map((emoji) => (
              <button
                type="button"
                key={emoji}
                onClick={() => addEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="roommix-chat-input-row">
        <input
  key={fileInputKey}
  id="roommix-file-input"
  type="file"
  style={{ display: "none" }}
  onChange={handleFileSelect}
/>

<label
  htmlFor="roommix-file-input"
  className="roommix-file-button"
  title="Send a file"
>
  {sendingFile ? "⏳" : "📎"}
</label>
          <button
            type="button"
            className="roommix-emoji-button"
            onClick={() =>
              setShowEmoji((current) => !current)
            }
            title="Add emoji"
          >
            😊
          </button>

          <input
            type="text"
            value={message}
            placeholder="Enter a message..."
            onChange={(event) =>
              setMessage(event.target.value)
            }
            onKeyDown={handleKeyDown}
            disabled={isSending}
          />

          <button
            type="button"
            className="roommix-send-button"
            onClick={sendMessage}
            disabled={!message.trim() || isSending}
          >
            {isSending ? "..." : "Send"}
          </button>

        </div>
      </div>
    </div>
  );
}
function HostParticipantsPanel({ isHost }) {
  const [mutedParticipants, setMutedParticipants] = useState({});

  const participants = useParticipants();
  const room = useRoomContext();

  const isLocalCoHost =
    room.localParticipant?.attributes?.coHost === "true";

  const canModerate =
    isHost === true || isLocalCoHost;

const makeCoHost = async (participant) => {
  try {
    const response = await fetch(
      `${API}/api/meetings/${encodeURIComponent(room.name)}/cohost`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          participantIdentity: participant.identity,
          requesterIdentity: room.localParticipant.identity,
        makeCoHost: participant.attributes?.coHost !== "true",
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to update co-host");
    }

    // Update participant locally so UI changes immediately
 

    console.log(
      data.isCoHost
        ? `Room Mix: ${participant.identity} is now Co-host`
        : `Room Mix: ${participant.identity} is no longer Co-host`
    );

    // Force participant panel to refresh
    setMutedParticipants((prev) => ({
      ...prev,
    }));

  } catch (error) {
    console.error("Room Mix co-host error:", error);
    alert(error.message);
  }
};


  const muteParticipant = async (participant) => {
    const audioPublication = Array.from(
      participant.audioTrackPublications.values()
    ).find((publication) => publication.trackSid);

    if (!audioPublication?.trackSid) {
      alert(
        "This participant is not currently publishing a microphone track."
      );
      return;
    }

    const roomName = room.name;
    const requesterIdentity = room.localParticipant.identity;
    const participantIdentity = participant.identity;
    const trackSid = audioPublication.trackSid;

    if (
      !roomName ||
      !participantIdentity ||
      !trackSid ||
      !requesterIdentity
    ) {
      alert(
        "Mute information is incomplete. Please reconnect to the meeting."
      );
      return;
    }

    try {
      const response = await fetch(
        `${API}/api/meetings/${encodeURIComponent(roomName)}/mute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            participantIdentity,
            trackSid,
            requesterIdentity,
            muted: true,
          }),
        }
      );


      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to mute participant");
      }

      console.log(
        `Room Mix: muted ${participant.name || participant.identity}`
      );
      setMutedParticipants((prev) => ({
  ...prev,
  [participant.identity]: true,
}));
    } catch (error) {
      console.error("Room Mix mute error:", error);
      alert(error.message);
    }
  };
  const unmuteParticipant = async (participant) => {
  const audioPublication = Array.from(
    participant.audioTrackPublications.values()
  ).find((publication) => publication.trackSid);

  if (!audioPublication?.trackSid) {
    alert(
      "This participant is not currently publishing a microphone track."
    );
    return;
  }

  const roomName = room.name;
  const requesterIdentity = room.localParticipant.identity;
  const participantIdentity = participant.identity;
  const trackSid = audioPublication.trackSid;

  if (
    !roomName ||
    !participantIdentity ||
    !trackSid ||
    !requesterIdentity
  ) {
    alert(
      "Unmute information is incomplete. Please reconnect to the meeting."
    );
    return;
  }

  try {
    const response = await fetch(
      `${API}/api/meetings/${encodeURIComponent(roomName)}/mute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          participantIdentity,
          trackSid,
          requesterIdentity,
          muted: false,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to unmute participant");
    }

    console.log(
      `Room Mix: unmuted ${participant.name || participant.identity}`
    );

    setMutedParticipants((prev) => ({
      ...prev,
      [participant.identity]: false,
    }));

  } catch (error) {
    console.error("Room Mix unmute error:", error);
    alert(error.message);
  }
};

  return (
    <div className="roommix-host-participants">

      <div className="roommix-host-participants-header">
        <div className="roommix-participants-title">
          <div className="roommix-participants-icon">
            👥
          </div>

          <div>
            <strong>Participants</strong>
            <span>
              {participants.length}{" "}
              {participants.length === 1 ? "person" : "people"}
            </span>
          </div>
        </div>

        <div className="roommix-participants-count">
          {participants.length}
        </div>
      </div>

      <div className="roommix-host-participants-list">

        {participants.map((participant) => {
          const isLocal =
            participant.identity === room.localParticipant.identity;

          const participantName =
            participant.name ||
            participant.identity ||
            "Participant";

          const initial = participantName
            .charAt(0)
            .toUpperCase();

          return (
            <div
              className={`roommix-host-participant ${
                isLocal ? "is-host" : ""
              }`}
              key={participant.identity}
            >

              <div className="roommix-host-participant-info">

                <div className="roommix-host-avatar">
                  {initial}
                </div>

                <div className="roommix-host-participant-name">
                  <div className="roommix-participant-name-row">
                    <strong>{participantName}</strong>

                    {isLocal && isHost && (
  <span className="roommix-host-badge">
    Host
  </span>
)}

{participant.isCoHost && (
  <span className="roommix-host-badge">
    Co-host
  </span>
)}
                  </div>

                  <small>
                    {isLocal ? "You" : "Participant"}
                  </small>
                </div>

              </div>

           {canModerate && !isLocal && (
  <button
    type="button"
    className="roommix-mute-participant"
    onClick={() =>
      mutedParticipants[participant.identity]
        ? unmuteParticipant(participant)
        : muteParticipant(participant)
    }
    title={
      mutedParticipants[participant.identity]
        ? `Unmute ${participantName}`
        : `Mute ${participantName}`
    }
  >
    <span className="roommix-mute-icon">
      {mutedParticipants[participant.identity] ? "🔊" : "🎤"}
    </span>

    <span>
      {mutedParticipants[participant.identity]
        ? "Unmute"
        : "Mute"}
    </span>
  </button>
)}
{isHost && !isLocal && (
  <button
    type="button"
    className="roommix-cohost-button"
    onClick={() => makeCoHost(participant)}
  >
    {participant.attributes?.coHost === "true"
      ? "Remove Co-host"
      : "Make Co-host"}
  </button>
)}

              {isLocal && (
                <div className="roommix-host-status">
                  <span className="roommix-status-dot" />
                  You
                </div>
              )}

            </div>
          );
        })}

        {participants.length === 0 && (
          <div className="roommix-no-participants">
            <div>👥</div>
            <strong>No participants yet</strong>
            <span>
              Participants who join the meeting will appear here.
            </span>
          </div>
        )}

      </div>
    </div>
  );
}
function Navbar({
  user,
  onHome,
  onLogin,
  onRegister,
  onLogout,
}) {
  return (
    <header className="navbar">
      <button className="brand" onClick={onHome}>
        <span className="brand-mark">R</span>
        <span>ROOM<span>MIX</span></span>
      </button>

      <div className="nav-actions">
        {user ? (
          <>
            <span className="user-pill">
              <span className="avatar">
                {user.name?.charAt(0)?.toUpperCase() || "U"}
              </span>
              {user.name}
            </span>

            <button className="nav-button" onClick={onLogout}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <button className="nav-button" onClick={onLogin}>
              Sign in
            </button>
            <button className="primary-small" onClick={onRegister}>
              Create account
            </button>
          </>
        )}
      </div>
    </header>
  );
}

function Home({ user, onCreate, onJoin, onRegister }) {
  return (
    <section className="hero">
      <div className="hero-glow glow-one" />
      <div className="hero-glow glow-two" />

      <div className="hero-content">
        <div className="eyebrow">
          <span className="status-dot" />
          REAL-TIME COMMUNICATION
        </div>

        <h1>
          Meetings,
          <br />
          <span>reimagined.</span>
        </h1>

        <p>
          High-quality video meetings with powerful collaboration,
          intelligent controls, and a beautifully simple experience.
        </p>

        <div className="hero-buttons">
          <button className="primary-button" onClick={onCreate}>
            <span>＋</span>
            New meeting
          </button>

          <button className="secondary-button" onClick={onJoin}>
            Join a meeting
            <span>→</span>
          </button>
        </div>

        {!user && (
          <button className="text-button" onClick={onRegister}>
            Create a free Room Mix account →
          </button>
        )}
      </div>

      <div className="hero-visual">
        <div className="floating-card card-top">
          <div className="mini-avatar">A</div>
          <div>
            <strong>Aditi is speaking</strong>
            <small>Room Mix</small>
          </div>
          <div className="sound-bars">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>

        <div className="video-preview">
          <div className="preview-gradient" />

          <div className="preview-content">
            <div className="preview-avatar">RM</div>
            <strong>Room Mix</strong>
            <small>Connected securely</small>
          </div>

          <div className="preview-controls">
            <span>🎙</span>
            <span>📹</span>
            <span>💬</span>
            <span>🖥</span>
          </div>
        </div>

        <div className="floating-card card-bottom">
          <span className="connection-icon">◉</span>
          <div>
            <strong>Excellent connection</strong>
            <small>Encrypted session</small>
          </div>
        </div>
      </div>
    </section>
  );
}

function AuthPage({
  type,
  form,
  setForm,
  onSuccess,
  onLogin,
  onRegister,
  error,
  setError,
}) {
  const register = type === "register";

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.email || !form.password) {
      setError("Please complete all required fields.");
      return;
    }

    if (register && !form.name) {
      setError("Please enter your name.");
      return;
    }

    try {
      const response = await fetch(
        `${API}/api/auth/${register ? "register" : "login"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Authentication failed.");
      }

      const data = await response.json();

      onSuccess(
        data.user || {
          name: form.name || form.email.split("@")[0],
          email: form.email,
        }
      );
    } catch (err) {
      /*
       * Development fallback:
       * This allows the new UI to be explored even if the backend
       * authentication endpoints have not yet been implemented.
       */
      onSuccess({
        name: form.name || form.email.split("@")[0],
        email: form.email,
      });
    }
  };

  return (
    <section className="center-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span>R</span>
        </div>

        <div className="eyebrow">ROOM MIX ACCOUNT</div>

        <h2>{register ? "Create your account" : "Welcome back"}</h2>

        <p className="auth-description">
          {register
            ? "Create your Room Mix account and start meeting."
            : "Sign in to continue to your meetings."}
        </p>

        <form onSubmit={submit}>
          {register && (
            <label>
              Full name
              <input
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                placeholder="Your name"
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm({ ...form, email: e.target.value })
              }
              placeholder="you@example.com"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
              placeholder="••••••••"
            />
          </label>

          {error && <div className="error-box">{error}</div>}

          <button className="primary-button full" type="submit">
            {register ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="auth-switch">
          {register ? (
            <>
              Already have an account?
              <button onClick={onLogin}>Sign in</button>
            </>
          ) : (
            <>
              Don't have an account?
              <button onClick={onRegister}>Create one</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Dashboard({ user, onCreate, onJoin }) {
  return (
    <section className="dashboard">
      <div className="dashboard-header">
        <div>
          <div className="eyebrow">YOUR WORKSPACE</div>
          <h2>
            Welcome back,
            <br />
            <span>{user?.name || "there"}.</span>
          </h2>
        </div>

        <div className="dashboard-actions">
          <button className="secondary-button" onClick={onJoin}>
            Join meeting
          </button>
          <button className="primary-button" onClick={onCreate}>
            ＋ New meeting
          </button>
        </div>
      </div>

      <div className="quick-grid">
        <button className="quick-card" onClick={onCreate}>
          <div className="quick-icon">＋</div>
          <strong>New meeting</strong>
          <span>Start an instant meeting</span>
        </button>

        <button className="quick-card" onClick={onJoin}>
          <div className="quick-icon">↗</div>
          <strong>Join meeting</strong>
          <span>Enter a meeting ID or link</span>
        </button>

        <button className="quick-card">
          <div className="quick-icon">◷</div>
          <strong>Schedule</strong>
          <span>Plan a meeting for later</span>
        </button>
      </div>

      <div className="dashboard-section">
        <div className="section-heading">
          <div>
            <span className="section-label">MEETINGS</span>
            <h3>Recent activity</h3>
          </div>
        </div>

        <div className="empty-state">
          <div className="empty-icon">◌</div>
          <strong>No meetings yet</strong>
          <span>
            Your recent and scheduled meetings will appear here.
          </span>
          <button className="text-button" onClick={onCreate}>
            Start your first meeting →
          </button>
        </div>
      </div>
    </section>
  );
}

function CreateMeeting({
  form,
  setForm,
  onCreate,
  onBack,
  error,
}) {
  return (
    <section className="center-page">
      <div className="meeting-form-card">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>

        <div className="eyebrow">NEW MEETING</div>

        <h2>Create a meeting</h2>

        <p className="auth-description">
          Start a secure Room Mix meeting and invite participants.
        </p>

        <label>
          Meeting name
          <input
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
            placeholder="e.g. Team standup"
          />
        </label>

        <div className="settings-preview">
          <div>
            <span>🔒</span>
            <div>
              <strong>Secure meeting</strong>
              <small>Unique meeting access will be generated.</small>
            </div>
          </div>

          <div>
            <span>👥</span>
            <div>
              <strong>Participant controls</strong>
              <small>Host controls are available in the meeting.</small>
            </div>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        <button className="primary-button full" onClick={onCreate}>
          Create meeting →
        </button>
      </div>
    </section>
  );
}

function JoinMeeting({
  form,
  setForm,
  onJoin,
  onBack,
  error,
}) {
  return (
    <section className="center-page">
      <div className="meeting-form-card">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>

        <div className="eyebrow">JOIN MEETING</div>

        <h2>Enter a meeting</h2>

        <p className="auth-description">
          Enter the meeting ID and passcode provided by the host.
        </p>

        <label>
          Meeting ID
          <input
            value={form.meetingId}
            onChange={(e) =>
              setForm({
                ...form,
                meetingId: e.target.value,
              })
            }
            placeholder="123 456 789"
          />
        </label>

        <label>
          Passcode
          <input
            value={form.passcode}
            onChange={(e) =>
              setForm({
                ...form,
                passcode: e.target.value,
              })
            }
            placeholder="Optional"
          />
        </label>

        {error && <div className="error-box">{error}</div>}

        <button className="primary-button full" onClick={onJoin}>
          Continue →
        </button>
      </div>
    </section>
  );
}

function PreJoin({
  meeting,
  user,
  onJoin,
  onBack,
  error,
}) {
  const [copied, setCopied] = React.useState(false);
  const [shareMessage, setShareMessage] = React.useState("");

  const meetingId = meeting?.meetingId || "";

  const meetingLink = `${window.location.origin}/?meeting=${encodeURIComponent(
    meetingId
  )}`;

  const copyMeetingLink = async () => {
    try {
      await navigator.clipboard.writeText(meetingLink);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setShareMessage(
        "Unable to copy automatically. Please copy the link manually."
      );
    }
  };

  const shareMeeting = async () => {
    const shareData = {
      title: meeting?.name || "Room Mix Meeting",
      text: `Join my Room Mix meeting.\nMeeting ID: ${meetingId}`,
      url: meetingLink,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(meetingLink);

        setCopied(true);

        setTimeout(() => {
          setCopied(false);
        }, 2000);
      }
    } catch {
      // User cancelled native sharing.
    }
  };

  return (
    <section className="prejoin-page">
      <div className="prejoin-card">
        <div className="prejoin-video">
          <div className="prejoin-avatar">
            {(user?.name || "U")
              .split(" ")
              .map((x) => x[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>

          <div className="prejoin-name">
            {user?.name || "Guest"}
          </div>

          <div className="camera-message">
            Camera preview will appear here
          </div>
        </div>

        <div className="prejoin-side">
          <button className="back-button" onClick={onBack}>
            ← Back
          </button>

          <div className="eyebrow">READY TO JOIN?</div>

          <h2>{meeting?.name || "Room Mix Meeting"}</h2>

          <p className="auth-description">
            Share the meeting with participants, then check your
            camera and microphone before entering.
          </p>

          {/* MEETING INVITE */}
          <div className="invite-box">
            <div className="invite-heading">
              <div>
                <span className="section-label">
                  MEETING INVITE
                </span>

                <strong>Invite participants</strong>
              </div>

              <span className="invite-lock">🔒</span>
            </div>

            <div className="meeting-detail">
              <span>Meeting ID</span>

              <strong>{meetingId}</strong>
            </div>

            {meeting?.passcode && (
              <div className="meeting-detail">
                <span>Passcode</span>

                <strong>{meeting.passcode}</strong>
              </div>
            )}

            <div className="meeting-link">
              <span>{meetingLink}</span>
            </div>

            <div className="invite-buttons">
              <button
                className="secondary-button"
                onClick={copyMeetingLink}
              >
                {copied ? "✓ Copied" : "Copy invite link"}
              </button>

              <button
                className="primary-button"
                onClick={shareMeeting}
              >
                ↗ Share
              </button>
            </div>

            {shareMessage && (
              <div className="share-message">
                {shareMessage}
              </div>
            )}
          </div>

          {/* DEV TESTING INFO */}
          <div className="testing-tip">
            <span>💡</span>

            <div>
              <strong>Testing with another browser?</strong>

              <small>
                Copy the invite link above and open it in
                Chrome Incognito, Edge, Firefox, or another
                browser.
              </small>
            </div>
          </div>

          <div className="device-row">
            <div>
              <span>🎙</span>
              <strong>Microphone</strong>
            </div>

            <span className="device-status">ON</span>
          </div>

          <div className="device-row">
            <div>
              <span>📹</span>
              <strong>Camera</strong>
            </div>

            <span className="device-status">ON</span>
          </div>

          {error && (
            <div className="error-box">
              {error}
            </div>
          )}

          <button
            className="primary-button full"
            onClick={onJoin}
          >
            Join meeting
          </button>
        </div>
      </div>
    </section>
  );
}
function MeetingEnded({ onDashboard }) {
  return (
    <section className="center-page">
      <div className="ended-card">
        <div className="ended-icon">✓</div>

        <div className="eyebrow">SESSION COMPLETE</div>

        <h2>Meeting ended</h2>

        <p>
          Your Room Mix meeting has ended successfully.
        </p>

        <button className="primary-button" onClick={onDashboard}>
          Return to dashboard
        </button>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);