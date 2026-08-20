
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { AccessToken,RoomServiceClient} from "livekit-server-sdk";
dotenv.config();

const livekitService = new RoomServiceClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);
const app = express();

const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

/*
|--------------------------------------------------------------------------
| In-memory meeting store
|--------------------------------------------------------------------------
|
| This lets Room Mix work immediately without adding another npm package
| or database dependency.
|
| Later we can move this to PostgreSQL/Prisma without changing the
| frontend meeting flow.
|
*/

const meetings = new Map();

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function generateMeetingId() {
  let id;

  do {
    const first = crypto.randomInt(100, 1000);
    const second = crypto.randomInt(100, 1000);
    const third = crypto.randomInt(100, 1000);

    id = `${first} ${second} ${third}`;
  } while (meetings.has(id));

  return id;
}

function generatePasscode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function generateRoomName() {
  return `room-mix-${crypto.randomUUID()}`;
}

function normalizeMeetingId(value) {
  if (!value) return "";

  return String(value)
    .trim()
    .replace(/\s+/g, " ");
}

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "Room Mix",
    service: "backend",
  });
});

/*
|--------------------------------------------------------------------------
| Create Meeting
|--------------------------------------------------------------------------
*/
app.post("/api/meetings", (req, res) => {
  try {
    const {
      name = "Room Mix Meeting",
      hostName = "Guest",
    } = req.body || {};

    const meetingId = generateMeetingId();
    const passcode = generatePasscode();
    const roomName = generateRoomName();

    const meeting = {
      meetingId,
      roomName,
      name: String(name).trim() || "Room Mix Meeting",
      passcode,
      hostName: String(hostName).trim() || "Guest",

      hostIdentity: `host-${crypto.randomUUID()}`,
      e2eeKey: crypto.randomBytes(32).toString("base64"),
      createdAt: new Date().toISOString(),

      locked: false,
      ended: false,
      waitingRoom: false,

      settings: {
        allowChat: true,
        allowScreenShare: true,
        allowReactions: true,
      },

      participants: [],
     coHostIdentities: [],
    };

    meetings.set(meetingId, meeting);

    console.log(
      `[Room Mix] Meeting created: ${meetingId} (${meeting.name})`
    );

    return res.status(201).json({
      success: true,

      meetingId: meeting.meetingId,
      roomName: meeting.roomName,
      name: meeting.name,
      passcode: meeting.passcode,

      hostName: meeting.hostName,
      hostIdentity: meeting.hostIdentity,
      e2eeKey: meeting.e2eeKey,
      locked: meeting.locked,
      waitingRoom: meeting.waitingRoom,

      createdAt: meeting.createdAt,

      livekitUrl: process.env.LIVEKIT_URL || "",
    });
  } catch (error) {
    console.error("[Room Mix] Create meeting error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create meeting",
      error: error.message,
    });
  }
});

app.post("/api/meetings/:roomName/mute", async (req, res) => {
  try {
    const { roomName } = req.params;

    const {
      participantIdentity,
      trackSid,
      requesterIdentity,
      muted,
    } = req.body || {};

    if (
      !roomName ||
      !participantIdentity ||
      !trackSid ||
      !requesterIdentity ||
      typeof muted !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        error:
          "roomName, participantIdentity, trackSid, requesterIdentity and muted are required",
      });
    }

    const meeting = [...meetings.values()].find(
      (item) => item.roomName === roomName
    );

    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: "Meeting not found",
      });
    }

    const isHost = requesterIdentity === meeting.hostIdentity;

const isCoHost =
  Array.isArray(meeting.coHostIdentities) &&
  meeting.coHostIdentities.includes(requesterIdentity);

if (!isHost && !isCoHost) {
  return res.status(403).json({
    success: false,
    error:
      "Only the host or co-host can change participant microphone state",
  });
}

    if (participantIdentity === meeting.hostIdentity) {
      return res.status(400).json({
        success: false,
        error: "Host cannot mute or unmute themselves",
      });
    }

    console.log(
      `[Room Mix] ${muted ? "Muting" : "Unmuting"} participant`,
      {
        roomName,
        participantIdentity,
        trackSid,
        requesterIdentity,
      }
    );

    await livekitService.mutePublishedTrack(
      roomName,
      participantIdentity,
      trackSid,
      muted
    );

    return res.json({
      success: true,
      muted,
      message: muted
        ? "Participant microphone muted"
        : "Participant microphone unmuted",
    });

  } catch (error) {
    console.error("ROOM MIX MUTE/UNMUTE ERROR");
    console.error(error);
    console.error("Message:", error?.message);

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Unable to change participant microphone state",
    });
  }
});
app.post("/api/meetings/:roomName/cohost", async (req, res) => {
  try {
    const { roomName } = req.params;

    const {
      participantIdentity,
      requesterIdentity,
      makeCoHost,
    } = req.body || {};

    if (
      !roomName ||
      !participantIdentity ||
      !requesterIdentity ||
      typeof makeCoHost !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        error:
          "roomName, participantIdentity, requesterIdentity and makeCoHost are required",
      });
    }

    const meeting = [...meetings.values()].find(
      (item) => item.roomName === roomName
    );

    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: "Meeting not found",
      });
    }

    // Only the actual host can assign/remove co-host
    if (requesterIdentity !== meeting.hostIdentity) {
      return res.status(403).json({
        success: false,
        error: "Only the host can manage co-hosts",
      });
    }

    // Host cannot be made co-host
    if (participantIdentity === meeting.hostIdentity) {
      return res.status(400).json({
        success: false,
        error: "Host cannot be made a co-host",
      });
    }

    // Store co-hosts on the meeting
    if (!meeting.coHostIdentities) {
      meeting.coHostIdentities = [];
    }

    if (makeCoHost) {
      if (!meeting.coHostIdentities.includes(participantIdentity)) {
        meeting.coHostIdentities.push(participantIdentity);
      }
    } else {
      meeting.coHostIdentities =
        meeting.coHostIdentities.filter(
          (identity) => identity !== participantIdentity
        );
    }
    await livekitService.updateParticipant(
  roomName,
  participantIdentity,
  {
    attributes: {
      coHost: makeCoHost ? "true" : "",
    },
  }
);

    console.log(
      `[Room Mix] ${
        makeCoHost ? "Made co-host" : "Removed co-host"
      }`,
      {
        roomName,
        participantIdentity,
        requesterIdentity,
      }
    );

    return res.json({
      success: true,
      isCoHost: makeCoHost,
      participantIdentity,
      coHostIdentities: meeting.coHostIdentities,
    });
  } catch (error) {
    console.error("ROOM MIX COHOST ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Unable to update co-host",
    });
  }
});
/*
|--------------------------------------------------------------------------
| Get Meeting
|--------------------------------------------------------------------------
*/

app.get("/api/meetings/:meetingId", (req, res) => {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);

    const meeting = meetings.get(meetingId);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    res.json({
      success: true,

      meetingId: meeting.meetingId,
      roomName: meeting.roomName,
      name: meeting.name,

      hostName: meeting.hostName,

      locked: meeting.locked,
      waitingRoom: meeting.waitingRoom,

      settings: meeting.settings,

      createdAt: meeting.createdAt,
    });
  } catch (error) {
    console.error("[Room Mix] Get meeting error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to get meeting",
    });
  }
});

/*
|--------------------------------------------------------------------------
| Join Meeting
|--------------------------------------------------------------------------
*/

app.post("/api/meetings/join", (req, res) => {
  try {
    const {
      meetingId: rawMeetingId,
      name = "Guest",
      passcode = "",
     
    } = req.body || {};

    const meetingId = normalizeMeetingId(rawMeetingId);

    if (!meetingId) {
      return res.status(400).json({
        success: false,
        message: "Meeting ID is required",
      });
    }

    const meeting = meetings.get(meetingId);
    if (meeting.ended) {
  return res.status(403).json({
    success: false,
    message: "This meeting has ended.",
  });
}

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found. Check the meeting ID.",
      });
    }

    if (meeting.locked) {
      return res.status(403).json({
        success: false,
        message: "This meeting is locked.",
      });
    }

    /*
     * The host can join using the generated passcode.
     * For now, participants may join without a passcode if the host
     * did not explicitly require one.
     */
    if (meeting.passcode && passcode && passcode !== meeting.passcode) {
      return res.status(403).json({
        success: false,
        message: "Incorrect meeting passcode.",
      });
    }

   const participantName =
  String(name).trim() || "Guest";

const isHost =
  Boolean(req.body?.isHost)&&
  passcode === meeting.passcode;

const identity = isHost
  ? meeting.hostIdentity
  : `participant-${crypto.randomUUID()}`;

const participant = {
  identity,
  name: participantName,
  joinedAt: new Date().toISOString(),
  role: isHost ? "host" : "participant",
};
    meeting.participants.push(participant);

    res.json({
      success: true,

      meetingId: meeting.meetingId,
      roomName: meeting.roomName,
      name: meeting.name,

      hostName: meeting.hostName,

      participantIdentity: identity,

      locked: meeting.locked,
      waitingRoom: meeting.waitingRoom,

      settings: meeting.settings,

      livekitUrl: process.env.LIVEKIT_URL || "",
    });
  } catch (error) {
    console.error("[Room Mix] Join meeting error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to join meeting",
    });
  }
});

/*
|--------------------------------------------------------------------------
| Generate LiveKit Token
|--------------------------------------------------------------------------
*/

app.post("/api/meetings/token", async (req, res) => {
  try {
    const {
      meetingId,
      room,
      identity,
      name = "Guest",
    } = req.body || {};

    /*
     * Support both:
     *
     * meetingId + name
     *
     * and the older:
     *
     * room + identity + name
     */

    let meeting = null;

    if (meetingId) {
      const normalizedId = normalizeMeetingId(meetingId);

      meeting = meetings.get(normalizedId);

      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: "Meeting not found",
        });
      }
    }

    const roomName = meeting?.roomName || room;

    if (!roomName) {
      return res.status(400).json({
        success: false,
        message: "Meeting room is required",
      });
    }

    if (
      !process.env.LIVEKIT_API_KEY ||
      !process.env.LIVEKIT_API_SECRET
    ) {
      return res.status(500).json({
        success: false,
        message:
          "LiveKit credentials are not configured. Please check backend/.env",
      });
    }

    /*
     * If the frontend didn't supply an identity,
     * generate a secure one.
     */
   const participantIdentity =
  meeting?.hostIdentity && identity === meeting.hostIdentity
    ? meeting.hostIdentity
    : identity || `user-${crypto.randomUUID()}`;

    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: participantIdentity,
        name: String(name).trim() || "Guest",
        ttl: "2h",
      }
    );

    token.addGrant({
      roomJoin: true,
      room: roomName,

      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();

    res.json({
      success: true,

      token: jwt,

      url:
        process.env.LIVEKIT_URL ||
        "",

      meetingId:
        meeting?.meetingId || null,

      roomName,
      e2eeKey: meeting?.e2eeKey || null,
      identity: participantIdentity,

      name:
        String(name).trim() ||
        "Guest",
        e2eeKey: meeting?.e2eeKey || null,
    });
    } catch (error) {
    console.error("====================================");
    console.error("ROOM MIX TOKEN ERROR");
    console.error("====================================");
    console.error(error);
    console.error("Message:", error?.message);
    console.error("Stack:", error?.stack);

    return res.status(500).json({
      success: false,
      message: "Unable to generate meeting access",
      error: error?.message || "Unknown LiveKit token error",
    });
  }
});


/*
|--------------------------------------------------------------------------
| Lock / Unlock Meeting
|--------------------------------------------------------------------------
*/

app.post("/api/meetings/:meetingId/lock", (req, res) => {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);
    const { requesterIdentity } = req.body || {};

    const meeting = meetings.get(meetingId);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    if (!requesterIdentity) {
      return res.status(400).json({
        success: false,
        message: "Requester identity is required",
      });
    }

    if (requesterIdentity !== meeting.hostIdentity) {
      return res.status(403).json({
        success: false,
        message: "Only the host can lock the meeting",
      });
    }

    meeting.locked = true;

    console.log(
      `[Room Mix] Meeting locked: ${meetingId} by ${requesterIdentity}`
    );

    return res.json({
      success: true,
      locked: true,
      message: "Meeting locked",
    });
  } catch (error) {
    console.error("[Room Mix] Lock meeting error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to lock meeting",
    });
  }
});

app.post("/api/meetings/:meetingId/unlock", (req, res) => {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);
    const { requesterIdentity } = req.body || {};

    const meeting = meetings.get(meetingId);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    if (!requesterIdentity) {
      return res.status(400).json({
        success: false,
        message: "Requester identity is required",
      });
    }

    if (requesterIdentity !== meeting.hostIdentity) {
      return res.status(403).json({
        success: false,
        message: "Only the host can unlock the meeting",
      });
    }

    meeting.locked = false;

    console.log(
      `[Room Mix] Meeting unlocked: ${meetingId} by ${requesterIdentity}`
    );

    return res.json({
      success: true,
      locked: false,
      message: "Meeting unlocked",
    });
  } catch (error) {
    console.error("[Room Mix] Unlock meeting error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to unlock meeting",
    });
  }
});
/*
|--------------------------------------------------------------------------
| End Meeting
|--------------------------------------------------------------------------
*/

app.post("/api/meetings/:meetingId/end", async (req, res) => {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);
    const { requesterIdentity } = req.body || {};

    const meeting = meetings.get(meetingId);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    if (!requesterIdentity) {
      return res.status(400).json({
        success: false,
        message: "Requester identity is required",
      });
    }

    // ONLY the actual host can end the meeting
    if (requesterIdentity !== meeting.hostIdentity) {
      return res.status(403).json({
        success: false,
        message: "Only the host can end the meeting",
      });
    }

    meeting.ended = true;

    // Disconnect everyone from the LiveKit room
    try {
      await livekitService.deleteRoom(meeting.roomName);
    } catch (livekitError) {
      console.error(
        "[Room Mix] LiveKit room deletion error:",
        livekitError?.message
      );
    }

    console.log(`[Room Mix] Meeting ended: ${meetingId}`);

    return res.json({
      success: true,
      ended: true,
      message: "Meeting ended",
    });
  } catch (error) {
    console.error("[Room Mix] End meeting error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to end meeting",
    });
  }
});
/*
|--------------------------------------------------------------------------
| Participant List
|--------------------------------------------------------------------------
*/

app.get(
  "/api/meetings/:meetingId/participants",
  (req, res) => {
    try {
      const meetingId = normalizeMeetingId(
        req.params.meetingId
      );

      const meeting = meetings.get(meetingId);

      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: "Meeting not found",
        });
      }

      res.json({
        success: true,
        participants: meeting.participants,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to retrieve participants",
      });
    }
  }
);
 


/*
|--------------------------------------------------------------------------
| Global 404
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`,
  });
});

/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {
  console.log("");
  console.log("====================================");
  console.log("        ROOM MIX BACKEND");
  console.log("====================================");
  console.log(`Server: http://localhost:${PORT}`);
  console.log(
    `LiveKit: ${
      process.env.LIVEKIT_URL || "NOT CONFIGURED"
    }`
  );
  console.log("====================================");
  console.log("");
});