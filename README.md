# Student Tracking & Parent Notification System

**A multi-tenant school management PWA that connects directors, teachers, counselors and parents.** It covers attendance, homework, exams, tuition and messaging, and sends real-time push notifications to parents.

🏫 In production at **[Atlas Eğitim Kurumu](https://atlasegitimkurumu.com)** (Denizli), a tutoring and exam-prep school.

> Designed and built solo by [Mert Ekiz](https://github.com/KHYAMPACK) / [Ekiz Yazılım](https://ekizyazilim.com).

---

## What it is

It started as a simple parent-notification app for a daycare. Now it's a full student-tracking system. Each school is a **tenant** with its own branding. Each role gets its own dashboard, and parents install the app on their phones as a PWA and get push notifications.

## Features by role

**Director / admin**
- Staff and role management, school branding, communications
- Exam operations: create mock exams, import results from CSV or optical-reader files, answer-key review, topic mapping, rankings and analysis
- Accounting: tuition payment tracking, expense ledger, budget planner, supplier directory, finance overview
- Records, calendar and announcements

**Teacher**
- Attendance, homework assignment, exam result entry and analysis
- Lesson and question tracking, alerts for students who need attention
- Direct messaging with parents

**Counselor**
- Student overview, exam progress, guidance notes

**Parent**
- Attendance, homework, exam reports with error breakdowns, weekly progress report
- Tuition status, announcements, messages from teachers
- Push notifications for everything above

**Automation** (Vercel Cron)
- Daily calendar reminders, daily tuition reminders, weekly report notifications

**Exports**
- PDF reports (`@react-pdf/renderer`) and Excel exports (`xlsx`)

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite, installable PWA (service worker) |
| Backend | Vercel serverless functions (`/api`) |
| Database / auth | Supabase (Postgres, Auth, Row Level Security, Realtime), 60+ migrations |
| Notifications | Web Push (VAPID) |
| Scheduling | Vercel Cron |
| Documents | React-PDF, SheetJS |

## Project layout

```
src/components/   role dashboards and feature modules (exams, attendance, accounting, homework…)
src/screens/      page-level screens
api/              serverless endpoints: push, tenant resolution, notifications, cron jobs, exam import
supabase/         SQL migrations
```

## Local development

```bash
npm install
cp .env.example .env    # Supabase URL/keys, VAPID keys
npm run dev
```

Deploys to Vercel (`vercel.json` sets up SPA rewrites and cron schedules).
