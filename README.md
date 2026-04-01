# MabiniLMS

A modern Learning Management System built with React, TypeScript, and Express.

## Project Structure

```
MabiniLMS/
├── client/          # React + TypeScript + Tailwind CSS frontend
├── server/          # Express + TypeScript backend
└── docs/            # Documentation
```

📁 **Detailed Structure**: See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)  
📋 **Quick Reference**: See [FILE_STRUCTURE.md](FILE_STRUCTURE.md)

To create organized folder structure:
```bash
python organize-structure.py
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

### Development

Run both client and server in development mode:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:client  # Start Vite dev server
npm run dev:server  # Start Express server
```

### Building

Build both client and server:

```bash
npm run build
```

### Linting & Formatting

```bash
npm run lint    # Run ESLint
npm run format  # Format with Prettier
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_KEY` - Supabase service role key (server-side only)
- `PORT` - Server port (default: 3000)

See **SUPABASE_QUICKSTART.md** for setup instructions.

## Tech Stack

### Client
- ⚡️ Vite
- ⚛️ React 18
- 🔷 TypeScript
- 🎨 Tailwind CSS
- 📱 PWA support

### Server
- 🚂 Express
- 🔷 TypeScript
- 🗄️ Supabase (PostgreSQL + Auth + Storage)
- 🔐 Built-in authentication

## Team Collaboration

- **GitHub Repository**: Create a repo and add all team members as collaborators
- **Project Board**: Set up GitHub Projects with columns: Backlog, In Progress, Review, Done

## License

Private - Team Project
