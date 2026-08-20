# Room Mix

A high-tech real-time video meeting platform with a separated React frontend and Node/Express backend.

## Stack
- React + Vite
- Express
- LiveKit for real-time audio/video
- JWT room tokens generated only by the backend

## Run
1. Install Node.js 20+.
2. Create a LiveKit project/server and obtain URL, API key and API secret.
3. Copy `backend/.env.example` to `backend/.env` and fill values.
4. Run `npm install`, then `npm run install:all`.
5. Run `npm run dev`.
6. Open http://localhost:5173.

The backend listens on port 5000 and the frontend on 5173.
