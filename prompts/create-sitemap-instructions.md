# How to Create the Sitemap Document

The sitemap document (`docs/sitemap.md`) tells the test agent how to navigate your application. It is injected into every agent's prompt, so accuracy matters.

## What Goes in the Sitemap

The sitemap should describe:
1. **Top-level navigation** — Main menu items and their URLs
2. **Key pages** — Important screens and how to reach them
3. **URL patterns** — How URLs are structured (e.g., `/users/:id/profile`)
4. **Entry points** — Where the agent should start (usually the login page or home page)
5. **Authentication flow** — How to log in, if required

## Process for Creating the Sitemap

### Option 1: Manual Documentation
Write `docs/sitemap.md` directly. Use the format below.

### Option 2: Via an Agent
Ask an Opencode agent to explore your app and document the navigation.

**Prompt template:**
```
Navigate to [URL] and explore the entire application.
Log in using these credentials: [username] / [password]
Document every page you visit, including:
- The URL
- How you got there (which link/button you clicked)
- What the page contains
- Any forms or interactive elements

Write the output as a sitemap in markdown format, organized by feature area.
Save it to docs/sitemap.md in the tester-agent project.
```

## Recommended Markdown Format

```markdown
# Sitemap: [App Name]

## Entry Point
- URL: https://app.example.com
- Requires authentication: Yes

## Authentication
- Login page: https://app.example.com/login
- Logout: Click user avatar (top-right) → "Sign Out"
- Session duration: 24 hours

## Main Navigation

### Dashboard
- URL: /dashboard
- Reach: Click "Dashboard" in left sidebar
- Contents: Stats cards, recent activity feed

### Users
- URL: /users
- Reach: Click "Users" in left sidebar
- Sub-pages:
  - User Profile: /users/:id — Click a user row in the table
  - User Settings: /users/:id/settings — Click "Settings" on profile page

### Settings
- URL: /settings
- Reach: Click gear icon (top-right)
- Sections: Account, Notifications, Billing
```

## Tips

- **Keep it current.** When the app changes, update the sitemap.
- **Be specific.** "Click the blue Save button" is better than "Save the form."
- **Include auth details.** Agents need to know how to log in.
- **Mention common gotchas.** "A modal may appear on first login asking for timezone."
- **Link to the env doc.** If the base URL varies by environment, mention that the env doc has the current URL.
