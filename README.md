# MabiniLMS

A modern Learning Management System built with React, TypeScript, and Express.

## Project Structure

```
MabiniLMS/
├── client/          # Vite + React + TypeScript + Tailwind CSS + PWA
├── server/          # Express + TypeScript API
├── .editorconfig    # Editor configuration
├── .eslintrc.json   # Shared ESLint config
├── .prettierrc.json # Shared Prettier config
└── package.json     # Workspace root
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

- `DB_URL` - Database connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `PORT` - Server port (default: 3000)

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
- 🔐 JWT authentication (to be implemented)
- 🗄️ Database (to be configured)

## Team Collaboration

- **GitHub Repository**: Create a repo and add all team members as collaborators
- **Project Board**: Set up GitHub Projects with columns: Backlog, In Progress, Review, Done

## License

Private - Team Project
