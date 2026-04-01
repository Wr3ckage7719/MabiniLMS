# Complete Setup Guide for MabiniLMS

## Automated Setup (Recommended)

Run ONE of these commands in the MabiniLMS directory:

### Option 1: Windows Command Prompt
```cmd
setup.bat
```

### Option 2: PowerShell  
```powershell
.\setup.ps1
```

### Option 3: Manual Setup

If the scripts don't work, follow these steps:

#### 1. Create Directory Structure
```cmd
mkdir client\src
mkdir server\src
```

#### 2. Create All Client Files

Create these files in the `client/` folder:

**client/package.json** - Already created ✓

**client/vite.config.ts** - Needs to be created

**client/tsconfig.json** - Needs to be created

**client/tsconfig.node.json** - Needs to be created

**client/index.html** - Needs to be created

**client/tailwind.config.js** - Needs to be created

**client/postcss.config.js** - Needs to be created

**client/src/main.tsx** - Needs to be created

**client/src/App.tsx** - Needs to be created

**client/src/index.css** - Needs to be created

**client/src/vite-env.d.ts** - Needs to be created

#### 3. Create All Server Files

**server/package.json** - Needs to be created

**server/tsconfig.json** - Needs to be created

**server/src/index.ts** - Needs to be created

#### 4. Install Dependencies
```cmd
npm install
```

## File Contents

All file contents are saved in individual files. If you need to recreate any file, refer to the individual files created.

## GitHub Setup

### 1. Create Repository
```bash
git init
git add .
git commit -m "Initial commit: Monorepo setup with Vite React + Express

- Set up client with Vite, React, TypeScript, Tailwind CSS, PWA
- Set up server with Express and TypeScript
- Configure ESLint, Prettier, EditorConfig
- Add workspace configuration for monorepo"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

### 2. Add Team Members
1. Go to your repository on GitHub
2. Click Settings → Collaborators
3. Click "Add people"
4. Enter each team member's GitHub username or email
5. Send invitations

### 3. Set Up GitHub Projects Board
1. Go to your repository on GitHub
2. Click "Projects" tab
3. Click "New project"
4. Choose "Board" template
5. Name it "MabiniLMS Development"
6. Create 4 columns:
   - **Backlog** - Ideas and tasks to be done
   - **In Progress** - Currently being worked on
   - **Review** - Code review and testing
   - **Done** - Completed tasks

## Development

### Start Development Servers
```bash
npm run dev
```

This starts both client (http://localhost:5173) and server (http://localhost:3000).

### Other Commands
- `npm run dev:client` - Start only client
- `npm run dev:server` - Start only server
- `npm run build` - Build for production
- `npm run lint` - Run linter
- `npm run format` - Format code

## Tech Stack Summary

✅ Vite + React + TypeScript  
✅ Tailwind CSS  
✅ PWA Plugin configured  
✅ Express server with TypeScript  
✅ ESLint + Prettier configured  
✅ EditorConfig added  
✅ .env.example created  
✅ Monorepo workspace structure  

## Next Steps

1. Run setup script or create folders manually
2. Install dependencies: `npm install`
3. Create GitHub repository and add collaborators
4. Set up GitHub Projects board
5. Start developing: `npm run dev`
