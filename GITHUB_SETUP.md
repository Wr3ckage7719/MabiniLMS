# GitHub Setup Guide for MabiniLMS

## 🚀 Quick Push to GitHub

Your repository: **https://github.com/Wr3ckage7719/MabiniLMS.git**

### Option 1: Automated Script (Easiest)

Run the batch script:
```cmd
push-to-github.bat
```

This will automatically:
- Initialize git
- Add all files
- Create initial commit
- Push to your GitHub repository

### Option 2: Manual Commands

If the script doesn't work, run these commands one by one:

```bash
# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Monorepo setup with Vite React + Express

- Set up client with Vite, React, TypeScript, Tailwind CSS, PWA
- Set up server with Express and TypeScript
- Configure ESLint, Prettier, EditorConfig
- Add workspace configuration for monorepo

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

# Set default branch to main
git branch -M main

# Add remote repository
git remote add origin https://github.com/Wr3ckage7719/MabiniLMS.git

# Push to GitHub
git push -u origin main
```

## 👥 Add Team Members as Collaborators

1. Go to: https://github.com/Wr3ckage7719/MabiniLMS/settings/access
2. Click **"Add people"** button
3. Enter each team member's GitHub username or email
4. Select permission level: **Write** (recommended) or **Admin**
5. Click **"Add [username] to this repository"**
6. They'll receive an email invitation to accept

### Team Member Checklist:
- [ ] Member 1: _______________ (username/email)
- [ ] Member 2: _______________ (username/email)
- [ ] Member 3: _______________ (username/email)
- [ ] Member 4: _______________ (username/email)
- [ ] Member 5: _______________ (username/email)

## 📋 Set Up GitHub Projects Board

### Step 1: Create Project
1. Go to: https://github.com/Wr3ckage7719/MabiniLMS/projects
2. Click **"New project"**
3. Select **"Board"** template
4. Name: **"MabiniLMS Development"**
5. Click **"Create"**

### Step 2: Configure Columns

The default columns might be different. Update them to:

1. **Backlog**
   - Description: "Tasks and features to be implemented"
   - Use for: New feature requests, bugs to fix, ideas

2. **In Progress**
   - Description: "Currently being worked on"
   - Use for: Active development tasks

3. **Review**
   - Description: "Code review and testing"
   - Use for: Pull requests, testing phase

4. **Done**
   - Description: "Completed and deployed"
   - Use for: Finished tasks

### Step 3: Add Initial Tasks

Create cards for immediate tasks:
- [ ] Set up development environment
- [ ] Install dependencies
- [ ] Configure database
- [ ] Design database schema
- [ ] Set up authentication
- [ ] Create user registration
- [ ] Create user login
- [ ] Build course management
- [ ] Build assignment system

## 🔧 Git Configuration (If Needed)

If you get errors about git identity:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

## 🔐 Authentication Issues?

If `git push` asks for credentials:

### Option A: Personal Access Token (Recommended)
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Give it a name: "MabiniLMS Development"
4. Select scopes: `repo` (all)
5. Click "Generate token"
6. Copy the token (you won't see it again!)
7. Use as password when pushing

### Option B: SSH Keys
1. Generate SSH key:
   ```bash
   ssh-keygen -t ed25519 -C "your.email@example.com"
   ```
2. Add to GitHub: https://github.com/settings/keys
3. Change remote URL:
   ```bash
   git remote set-url origin git@github.com:Wr3ckage7719/MabiniLMS.git
   ```

## ✅ Verification Checklist

After completing setup:

- [ ] Code is pushed to GitHub
- [ ] Repository is visible at: https://github.com/Wr3ckage7719/MabiniLMS
- [ ] All team members added as collaborators
- [ ] All team members accepted invitations
- [ ] GitHub Projects board created
- [ ] Board has 4 columns: Backlog, In Progress, Review, Done
- [ ] Initial tasks added to board
- [ ] README.md is visible on repository homepage

## 🎯 Next Development Steps

Once GitHub is set up:

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development**
   ```bash
   npm run dev
   ```

3. **Create Feature Branches**
   ```bash
   git checkout -b feature/user-authentication
   ```

4. **Regular Commits**
   ```bash
   git add .
   git commit -m "feat: add user login functionality"
   git push origin feature/user-authentication
   ```

5. **Create Pull Requests**
   - Go to repository on GitHub
   - Click "Pull requests" → "New pull request"
   - Select your feature branch
   - Add description and request review

## 📚 Useful Links

- **Repository**: https://github.com/Wr3ckage7719/MabiniLMS
- **Issues**: https://github.com/Wr3ckage7719/MabiniLMS/issues
- **Projects**: https://github.com/Wr3ckage7719/MabiniLMS/projects
- **Settings**: https://github.com/Wr3ckage7719/MabiniLMS/settings

---

**Ready to collaborate!** 🎉 Once everyone is added, start working on features!
