# 🚂 Railway Database Migrations Guide

## ✅ What Was Fixed

Your build process now **automatically runs migrations** on Railway!

---

## 📝 Updated Build Process

**Before (❌ No migrations):**
```json
"build": "tsc && tsc-alias"
```

**After (✅ With migrations):**
```json
"build": "prisma generate && prisma migrate deploy && tsc && tsc-alias"
```

---

## 🔧 What Happens on Railway Deploy

### **Build Phase:**

```
1. npm ci
   ↓ Install dependencies
   
2. npm run build
   ↓
   a) prisma generate      ← Generate Prisma Client
   b) prisma migrate deploy ← Run pending migrations
   c) tsc                   ← Compile TypeScript
   d) tsc-alias            ← Resolve path aliases
   
3. ✅ Build complete!
```

### **Start Phase:**
```
npm run start
 ↓
node dist/index.js
 ↓
✅ Server running with migrated database!
```

---

## 🎯 Migration Commands Explained

| Command | When to Use | What it Does |
|---------|-------------|--------------|
| `prisma generate` | Always | Generates Prisma Client from schema |
| `prisma migrate deploy` | **Production** | Runs pending migrations (safe) |
| `prisma migrate dev` | **Development** | Creates & runs migrations (interactive) |

**Why `migrate deploy` for Railway:**
- ✅ Non-interactive (no prompts)
- ✅ Only runs pending migrations
- ✅ Safe for production
- ✅ Idempotent (can run multiple times)

---

## 📊 Migration Workflow

### **Local Development:**
```bash
# 1. Update schema.prisma
# 2. Create migration
npm run db:migrate

# Prisma asks: "Name of migration?"
# Enter: "add_countdown_field" (or whatever you changed)

# 3. Migration created and applied locally
```

### **Deploy to Railway:**
```bash
# 1. Commit changes
git add prisma/schema.prisma
git add prisma/migrations/
git commit -m "feat: add countdown field"
git push origin main

# 2. Railway automatically:
#    - Pulls latest code
#    - Runs: prisma generate
#    - Runs: prisma migrate deploy  ← Your migrations!
#    - Builds TypeScript
#    - Starts server

# 3. ✅ Database is migrated!
```

---

## 🔍 Check Migrations on Railway

### **View Build Logs:**

1. Go to Railway dashboard
2. Click on your service
3. Click "Deployments"
4. Click latest deployment
5. Look for:
```
Running prisma generate...
✓ Generated Prisma Client

Running prisma migrate deploy...
1 migration found
Applying migration `20250102_add_countdown`
✓ Migration applied successfully
```

---

## ⚠️ Common Issues & Fixes

### **Issue: "Migration failed - column already exists"**

**Cause:** Railway database already has the column
**Fix:** 
```bash
# Locally, mark migration as applied
prisma migrate resolve --applied "migration_name"

# Then deploy
git push origin main
```

### **Issue: "Prisma Client not generated"**

**Cause:** `prisma generate` didn't run
**Fix:** Added `postinstall` script:
```json
"postinstall": "prisma generate"
```

This runs after `npm install` automatically!

### **Issue: "DATABASE_URL not set"**

**Cause:** Missing environment variable on Railway
**Fix:** 
1. Railway dashboard → Your service → Variables
2. Add: `DATABASE_URL=postgresql://...`
3. Railway PostgreSQL plugin sets this automatically

---

## 🎯 Your Current Setup (After Fix)

**package.json scripts:**
```json
{
  "build": "prisma generate && prisma migrate deploy && tsc && tsc-alias",
  "start": "node dist/index.js",
  "postinstall": "prisma generate",
  "db:migrate:deploy": "prisma migrate deploy"
}
```

**What runs on Railway:**
```
npm ci
 ↓ postinstall runs → prisma generate ✅
 
npm run build
 ↓ prisma generate ✅
 ↓ prisma migrate deploy ✅
 ↓ tsc ✅
 ↓ tsc-alias ✅
 
npm run start
 ↓ Server starts ✅
```

---

## 📝 Creating New Migrations

### **When you change schema.prisma:**

```bash
# 1. Update schema
vim prisma/schema.prisma

# 2. Create migration locally
npm run db:migrate
# Enter name: "add_new_field"

# 3. Test locally
npm run dev

# 4. Commit and push
git add prisma/
git commit -m "feat: add new field to schema"
git push origin main

# 5. Railway automatically migrates! ✅
```

---

## 🚀 Best Practices

### **✅ DO:**
- Use `prisma migrate deploy` in production (Railway)
- Commit migration files to git
- Test migrations locally first
- Use descriptive migration names
- Keep DATABASE_URL in Railway environment variables

### **❌ DON'T:**
- Don't use `prisma migrate dev` in production
- Don't skip committing migration files
- Don't manually edit migration SQL (unless necessary)
- Don't run migrations directly on production database

---

## 🎯 Summary

**Question:** "Do migrations run automatically on Railway?"

**Answer:** **NOW they do!** ✅

**Before:** NO - You had to run them manually  
**After:** YES - They run during build automatically

---

## 🧪 Test It

Push this change to Railway and watch the build logs:

```bash
git add package.json
git commit -m "feat: auto-run Prisma migrations on Railway build"
git push origin main
```

**In Railway build logs, you'll see:**
```
✓ Running prisma generate...
✓ Running prisma migrate deploy...
✓ Migrations applied successfully!
```

---

**Your migrations will now run automatically on every Railway deployment!** 🎉

