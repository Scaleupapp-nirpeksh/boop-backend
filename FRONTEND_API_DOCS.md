# Boop Backend - Complete Frontend API Documentation

> **Base URL:** `http://<server>:<port>/api/v1`
> **Last Updated:** March 2026

This document is the single source of truth for the Boop mobile app frontend team. It covers every API endpoint, every request/response shape, the real-time Socket.IO layer, all enums/constants, and the complete user journey from signup to dating.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Standard Response Format](#2-standard-response-format)
3. [Authentication & Token Management](#3-authentication--token-management)
4. [User Journey & Profile Stages](#4-user-journey--profile-stages)
5. [Connection Stages (Match Lifecycle)](#5-connection-stages-match-lifecycle)
6. [API Reference: Auth](#6-api-reference-auth)
7. [API Reference: Profile](#7-api-reference-profile)
8. [API Reference: Questions](#8-api-reference-questions)
9. [API Reference: Discover](#9-api-reference-discover)
10. [API Reference: Matches](#10-api-reference-matches)
11. [API Reference: Messages](#11-api-reference-messages)
12. [API Reference: Games](#12-api-reference-games)
13. [Socket.IO Real-Time Events](#13-socketio-real-time-events)
14. [Enums & Constants Reference](#14-enums--constants-reference)
15. [Photo Visibility Rules](#15-photo-visibility-rules)
16. [Comfort Score System](#16-comfort-score-system)
17. [Date Readiness System](#17-date-readiness-system)
18. [Compatibility & Match Tiers](#18-compatibility--match-tiers)
19. [Error Handling](#19-error-handling)
20. [Rate Limits](#20-rate-limits)
21. [Push Notifications (FCM)](#21-push-notifications-fcm)

---

## 1. Architecture Overview

| Layer | Technology |
|-------|-----------|
| API Framework | Express.js (REST) |
| Real-time | Socket.IO |
| Database | MongoDB (Mongoose ODM) |
| Cache | Redis |
| File Storage | AWS S3 (presigned URLs, 1-hour expiry) |
| Auth | JWT (access + refresh tokens) |
| SMS OTP | Twilio |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| AI | OpenAI (embeddings for compatibility, transcription for voice) |

---

## 2. Standard Response Format

**Every** API response follows this structure:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Human-readable description",
  "data": { ... },
  "errors": []
}
```

### Error Response

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation error",
  "errors": [
    { "field": "phone", "message": "Phone number is required" }
  ]
}
```

### Common Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request / Validation Error |
| 401 | Unauthorized (missing/invalid/expired token) |
| 403 | Forbidden (profile not ready, question locked, etc.) |
| 404 | Not Found |
| 409 | Conflict (duplicate like, already answered, etc.) |
| 429 | Rate Limited |
| 500 | Internal Server Error |

---

## 3. Authentication & Token Management

### How It Works

1. User sends phone number -> receives 6-digit OTP via SMS
2. User verifies OTP -> receives `accessToken` (15 min) + `refreshToken` (30 days)
3. All protected API calls require `Authorization: Bearer <accessToken>` header
4. When access token expires, use refresh token to get a new one
5. Socket.IO connections also authenticate via the access token

### Token Refresh Strategy

- Access token expires in **15 minutes**
- Refresh token expires in **30 days**
- When you get a `401` error, call `POST /auth/refresh-token` with the refresh token
- If the refresh token is also expired, redirect user to the login screen

### Authorization Header

```
Authorization: Bearer eyJhbGciOiJIUzI1NiI...
```

---

## 4. User Journey & Profile Stages

The user must complete their profile before they can discover/match with others. Profile completion is tracked via `profileStage`:

```
incomplete -> voice_pending -> questions_pending -> ready
```

| Stage | Trigger to Advance | What To Show |
|-------|-------------------|--------------|
| `incomplete` | User fills in `firstName`, `dateOfBirth`, `gender`, `interestedIn`, `location` via `PUT /profile/basic-info` | Profile setup screens (name, DOB, gender, interests, location) |
| `voice_pending` | User uploads voice intro via `POST /profile/voice-intro` | Voice recording screen |
| `questions_pending` | User answers 15+ questions via `POST /questions/answer` | Questions flow (show progress) |
| `ready` | Automatic when 15th answer is submitted | Full app access: Discover, Matches, Messages |

**Important:** Endpoints under `/discover`, `/matches`, and `/games` require `profileStage === 'ready'`. They will return `403` otherwise.

---

## 5. Connection Stages (Match Lifecycle)

When two users mutually like each other, a **Match** is created. The match progresses through stages:

```
mutual -> connecting -> reveal_ready -> revealed -> dating -> archived
```

| Stage | Description | What Happens | Frontend Behavior |
|-------|-------------|-------------|------------------|
| `mutual` | Both users liked each other | Match is created, conversation auto-created | Show "New Match!" notification. User can start chatting. |
| `connecting` | First message sent | Auto-transitions from `mutual` when either user sends first message | Show chat interface with silhouette/blurred photos |
| `reveal_ready` | Comfort score >= 70 | Both users can now request photo reveal | Show "Request Photo Reveal" button |
| `revealed` | Both users requested reveal | Photos become visible | Show real profile photos + gallery |
| `dating` | Users advance manually | Match is in "dating" mode | Show date readiness score, planning features |
| `archived` | Match ended | Either user archived the match | Remove from active matches list |

### Stage Transition Rules

- `mutual` -> `connecting`: **Automatic** on first message sent
- `connecting` -> `reveal_ready`: Requires **comfort score >= 70** (call `PATCH /matches/:id/advance`)
- `reveal_ready` -> `revealed`: Both users must call `POST /matches/:id/reveal`
- `revealed` -> `dating`: Manual advance via `PATCH /matches/:id/advance`
- Any stage -> `archived`: Via `PATCH /matches/:id/archive`

---

## 6. API Reference: Auth

### 6.1 Send OTP

```
POST /auth/send-otp
```

**Auth Required:** No

**Request Body:**
```json
{
  "phone": "+919876543210"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| `phone` | string | Yes | E.164 format (`+919876543210`) or 10-digit (`9876543210`) |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "OTP sent successfully",
  "data": {
    "phone": "+919876543210",
    "expiresIn": 600
  }
}
```

**Error Cases:**
- `400` - Invalid phone format
- `429` - Rate limited (must wait 60 seconds between OTP requests)

---

### 6.2 Verify OTP

```
POST /auth/verify-otp
```

**Auth Required:** No

**Request Body:**
```json
{
  "phone": "+919876543210",
  "otp": "123456"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| `phone` | string | Yes | Same format as send-otp |
| `otp` | string | Yes | Exactly 6 digits |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Account created successfully",
  "data": {
    "user": {
      "_id": "65a1b2c3d4e5f6a7b8c9d0e1",
      "phone": "+919876543210",
      "phoneVerified": true,
      "firstName": null,
      "dateOfBirth": null,
      "gender": null,
      "interestedIn": null,
      "profileStage": "incomplete",
      "questionsAnswered": 0,
      "isPremium": false,
      "isActive": true,
      "photos": { "items": [], "profilePhoto": null, "totalPhotos": 0 },
      "bio": { "text": null, "audioUrl": null },
      "voiceIntro": null,
      "location": null,
      "createdAt": "2026-03-10T10:00:00.000Z",
      "updatedAt": "2026-03-10T10:00:00.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiI...",
    "refreshToken": "eyJhbGciOiJIUzI1NiI...",
    "isNewUser": true
  }
}
```

**Notes:**
- `isNewUser: true` means the user was just created -> show onboarding flow
- `isNewUser: false` means existing user logging in -> navigate to appropriate screen based on `profileStage`
- **Store both tokens securely** (Keychain on iOS, EncryptedSharedPreferences on Android)
- Max 3 OTP attempts before the OTP is invalidated

---

### 6.3 Refresh Token

```
POST /auth/refresh-token
```

**Auth Required:** No

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiI..."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiI...",
    "user": { ... }
  }
}
```

**Error Cases:**
- `401` - Invalid or expired refresh token -> force re-login

---

### 6.4 Logout

```
POST /auth/logout
```

**Auth Required:** Yes

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Logged out successfully",
  "data": null
}
```

---

### 6.5 Get Current User

```
GET /auth/me
```

**Auth Required:** Yes

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "User profile retrieved successfully",
  "data": {
    "user": {
      "_id": "65a1b2c3d4e5f6a7b8c9d0e1",
      "phone": "+919876543210",
      "phoneVerified": true,
      "firstName": "Arjun",
      "dateOfBirth": "1998-05-15T00:00:00.000Z",
      "gender": "male",
      "interestedIn": "women",
      "username": null,
      "profileStage": "ready",
      "questionsAnswered": 18,
      "isPremium": false,
      "isActive": true,
      "isOnline": true,
      "lastSeen": "2026-03-10T10:00:00.000Z",
      "photos": {
        "items": [
          { "url": "https://s3-url...", "s3Key": "users/.../photo.webp", "order": 0, "uploadedAt": "..." },
          { "url": "https://s3-url...", "s3Key": "users/.../photo2.webp", "order": 1, "uploadedAt": "..." }
        ],
        "profilePhoto": {
          "url": "https://s3-url...",
          "s3Key": "users/.../profile.webp",
          "blurredUrl": "https://s3-url...",
          "silhouetteUrl": "https://s3-url..."
        },
        "totalPhotos": 2
      },
      "bio": {
        "text": "Love hiking and coffee",
        "audioUrl": null,
        "audioDuration": null,
        "transcription": null
      },
      "voiceIntro": {
        "audioUrl": "https://s3-presigned-url...",
        "s3Key": "users/.../voiceintro.m4a",
        "duration": 28.5,
        "transcription": "Hey, I'm Arjun...",
        "createdAt": "2026-03-09T12:00:00.000Z"
      },
      "location": {
        "city": "Bangalore",
        "coordinates": [77.5946, 12.9716]
      },
      "notificationPreferences": {
        "allMuted": false,
        "quietHoursStart": "22:00",
        "quietHoursEnd": "07:00",
        "timezone": "Asia/Kolkata"
      },
      "createdAt": "2026-03-01T10:00:00.000Z",
      "updatedAt": "2026-03-10T10:00:00.000Z"
    }
  }
}
```

---

## 7. API Reference: Profile

### 7.1 Get Profile

```
GET /profile
```

**Auth Required:** Yes

**Success Response (200):** Same user object as `GET /auth/me`.

---

### 7.2 Update Basic Info

```
PUT /profile/basic-info
```

**Auth Required:** Yes

**Request Body:** (all fields optional, send only what you want to update)
```json
{
  "firstName": "Arjun",
  "dateOfBirth": "1998-05-15",
  "gender": "male",
  "interestedIn": "women",
  "bio": "Love hiking and coffee",
  "location": {
    "city": "Bangalore",
    "coordinates": [77.5946, 12.9716]
  }
}
```

| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| `firstName` | string | No | 1-50 chars |
| `dateOfBirth` | ISO date string | No | Must be in the past |
| `gender` | string | No | `male`, `female`, `non-binary`, `other` |
| `interestedIn` | string | No | `men`, `women`, `everyone` |
| `bio` | string | No | Max 500 chars |
| `location.city` | string | No | Max 100 chars |
| `location.coordinates` | [number, number] | No | `[longitude, latitude]` |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Profile updated successfully",
  "data": {
    "user": { ... }
  }
}
```

**Notes:**
- When all required fields (`firstName`, `dateOfBirth`, `gender`, `interestedIn`) are set, `profileStage` auto-advances from `incomplete` to `voice_pending`
- Coordinates format is **[longitude, latitude]** (GeoJSON standard, NOT lat/lng)

---

### 7.3 Upload Voice Intro

```
POST /profile/voice-intro
```

**Auth Required:** Yes
**Content-Type:** `multipart/form-data`

| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| `audio` | file | Yes | Audio file, max 10 MB |
| `duration` | number (form field) | No | Duration in seconds (max 60) |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Voice intro uploaded successfully",
  "data": {
    "user": { ... }
  }
}
```

**Notes:**
- Accepted audio formats: m4a, mp3, wav, aac, ogg, webm
- After upload, `profileStage` advances from `voice_pending` to `questions_pending`
- The audio is automatically transcribed via OpenAI Whisper (async, may take a few seconds)

---

### 7.4 Upload Gallery Photos

```
POST /profile/photos
```

**Auth Required:** Yes
**Content-Type:** `multipart/form-data`

| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| `photos` | file[] | Yes | 1-6 image files, max 5 MB each |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "3 photo(s) uploaded successfully",
  "data": {
    "user": { ... }
  }
}
```

**Notes:**
- Maximum 6 photos total. If user already has 4, they can upload at most 2 more.
- First photo uploaded becomes the **profile photo** (with blurred + silhouette versions auto-generated)
- Images are auto-resized to 800x800 WebP format
- Profile photo generates 3 variants:
  - **Original** (only shown after photo reveal)
  - **Blurred** (shown to matches before reveal)
  - **Silhouette** (shown on discover cards)

---

### 7.5 Delete Photo

```
DELETE /profile/photos/:index
```

**Auth Required:** Yes

| Param | Type | Description |
|-------|------|-------------|
| `index` | number | Zero-based index of the photo in `photos.items` array |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Photo deleted successfully",
  "data": {
    "user": { ... }
  }
}
```

---

### 7.6 Reorder Photos

```
PUT /profile/photos/reorder
```

**Auth Required:** Yes

**Request Body:**
```json
{
  "orderedPhotoIds": ["s3key1", "s3key2", "s3key3"],
  "mainPhotoId": "s3key2"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `orderedPhotoIds` | string[] | Yes | S3 keys in desired order |
| `mainPhotoId` | string | No | S3 key of the photo to set as profile photo |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Photos updated successfully",
  "data": {
    "user": { ... }
  }
}
```

---

### 7.7 Update FCM Token

```
PUT /profile/fcm-token
```

**Auth Required:** Yes

**Request Body:**
```json
{
  "fcmToken": "firebase-cloud-messaging-token-here"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "FCM token updated",
  "data": null
}
```

**Notes:** Call this on every app launch and whenever the FCM token refreshes.

---

### 7.8 Update Notification Preferences

```
PUT /profile/notification-preferences
```

**Auth Required:** Yes

**Request Body:**
```json
{
  "allMuted": false,
  "quietHoursStart": "22:00",
  "quietHoursEnd": "07:00",
  "timezone": "Asia/Kolkata"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| `allMuted` | boolean | No | Mute all notifications |
| `quietHoursStart` | string | No | `HH:mm` format (24-hour) |
| `quietHoursEnd` | string | No | `HH:mm` format (24-hour) |
| `timezone` | string | No | IANA timezone string |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Notification preferences updated",
  "data": {
    "user": { ... }
  }
}
```

---

## 8. API Reference: Questions

Boop uses **60 psychological questions** across 8 dimensions, unlocked progressively over 10 days. Users must answer at least **15 questions** to complete their profile.

### 8.1 Get Available Questions

```
GET /questions
```

**Auth Required:** Yes

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "12 questions available",
  "data": {
    "questions": [
      {
        "_id": "65a1...",
        "questionNumber": 1,
        "dimension": "emotional_vulnerability",
        "depthLevel": "surface",
        "questionText": "When was the last time you cried, and what triggered it?",
        "questionType": "text",
        "options": [],
        "followUpQuestion": "How did you feel after?",
        "characterLimit": 500,
        "dayAvailable": 1,
        "order": 1,
        "weight": 1.5
      },
      {
        "_id": "65a2...",
        "questionNumber": 5,
        "dimension": "attachment_patterns",
        "depthLevel": "moderate",
        "questionText": "How do you prefer to show love?",
        "questionType": "single_choice",
        "options": ["Words of affirmation", "Quality time", "Physical touch", "Acts of service", "Gifts"],
        "followUpQuestion": null,
        "characterLimit": 500,
        "dayAvailable": 1,
        "order": 5,
        "weight": 1.0
      },
      {
        "_id": "65a3...",
        "questionNumber": 8,
        "dimension": "lifestyle_rhythm",
        "depthLevel": "surface",
        "questionText": "What does your ideal weekend look like?",
        "questionType": "multiple_choice",
        "options": ["Adventure outdoors", "Cozy at home", "Social gatherings", "Solo exploration", "Creative projects"],
        "followUpQuestion": null,
        "characterLimit": 500,
        "dayAvailable": 1,
        "order": 8,
        "weight": 0.8
      }
    ],
    "meta": {
      "daysSinceRegistration": 3,
      "totalUnlocked": 20,
      "totalAnswered": 8,
      "totalRemaining": 12
    }
  }
}
```

**Notes:**
- Questions unlock based on `dayAvailable` vs user's registration day (Day 1 = signup day)
- Only shows questions that are unlocked AND not yet answered
- Display the appropriate input based on `questionType`:
  - `text` -> Text field (with `characterLimit`)
  - `single_choice` -> Radio buttons from `options` array
  - `multiple_choice` -> Checkboxes from `options` array
- If `followUpQuestion` is present, show it after the main answer

---

### 8.2 Submit Answer (Text/Choice)

```
POST /questions/answer
```

**Auth Required:** Yes

**Request Body:**

For **text** questions:
```json
{
  "questionNumber": 1,
  "textAnswer": "Last week when I watched a movie about...",
  "followUpAnswer": "I felt relieved afterwards",
  "timeSpent": 45
}
```

For **single_choice** questions:
```json
{
  "questionNumber": 5,
  "selectedOption": "Quality time",
  "timeSpent": 12
}
```

For **multiple_choice** questions:
```json
{
  "questionNumber": 8,
  "selectedOptions": ["Adventure outdoors", "Solo exploration"],
  "timeSpent": 8
}
```

| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| `questionNumber` | number | Yes | 1-60 |
| `textAnswer` | string | For text questions | Max 500 chars (or question's `characterLimit`) |
| `selectedOption` | string | For single_choice | Must be from question's `options` |
| `selectedOptions` | string[] | For multiple_choice | Each must be from question's `options` |
| `followUpAnswer` | string | No | Max 300 chars |
| `timeSpent` | number | No | Seconds spent (0-3600) |

**Success Response (201):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Answer submitted for question 1",
  "data": {
    "answer": {
      "_id": "65b1...",
      "userId": "65a1...",
      "questionId": "65a1...",
      "questionNumber": 1,
      "textAnswer": "Last week when I watched a movie about...",
      "selectedOption": null,
      "selectedOptions": [],
      "followUpAnswer": "I felt relieved afterwards",
      "timeSpent": 45,
      "submittedAt": "2026-03-10T10:30:00.000Z"
    },
    "questionsAnswered": 15,
    "profileStage": "ready"
  }
}
```

**Important Frontend Logic:**
- After each answer, check `profileStage` in the response
- When it changes to `"ready"`, show a celebration screen and enable Discover/Matches tabs
- When `questionsAnswered` reaches 15, the profile is complete

**Error Cases:**
- `403` - Question not yet unlocked (show "Come back on day X")
- `409` - Already answered this question

---

### 8.3 Submit Voice Answer

```
POST /questions/voice-answer
```

**Auth Required:** Yes
**Content-Type:** `multipart/form-data`

| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| `audio` | file | Yes | Audio file, max 10 MB |
| `questionNumber` | number (form field) | Yes | 1-60 |

**Success Response (201):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Voice answer submitted for question 1",
  "data": {
    "answer": {
      "_id": "65b2...",
      "textAnswer": "[Voice answer — transcribing...]",
      "voiceAnswerUrl": "https://s3-presigned-url...",
      "transcriptionPending": true,
      ...
    },
    "questionsAnswered": 16,
    "profileStage": "ready"
  }
}
```

**Notes:**
- The voice answer is transcribed asynchronously. The `textAnswer` field initially contains `"[Voice answer — transcribing...]"` and gets updated once transcription completes.

---

### 8.4 Get Question Progress

```
GET /questions/progress
```

**Auth Required:** Yes

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Question progress retrieved",
  "data": {
    "totalAnswered": 18,
    "totalUnlocked": 30,
    "totalQuestions": 60,
    "daysSinceRegistration": 5,
    "profileStage": "ready",
    "readyThreshold": 15,
    "isReady": true,
    "dimensions": {
      "emotional_vulnerability": { "answered": 3, "unlocked": 5, "total": 8 },
      "attachment_patterns": { "answered": 2, "unlocked": 4, "total": 7 },
      "life_vision": { "answered": 3, "unlocked": 3, "total": 7 },
      "conflict_resolution": { "answered": 2, "unlocked": 4, "total": 8 },
      "love_expression": { "answered": 2, "unlocked": 3, "total": 7 },
      "intimacy_comfort": { "answered": 2, "unlocked": 4, "total": 8 },
      "lifestyle_rhythm": { "answered": 2, "unlocked": 4, "total": 8 },
      "growth_mindset": { "answered": 2, "unlocked": 3, "total": 7 }
    }
  }
}
```

**Frontend Usage:**
- Show overall progress bar: `totalAnswered / readyThreshold` (until ready) or `totalAnswered / totalQuestions` (after ready)
- Show per-dimension progress rings/bars using the `dimensions` object
- `isReady: true` means profile is complete

---

## 9. API Reference: Discover

**All discover endpoints require `profileStage === 'ready'`** (returns 403 otherwise).

### 9.1 Get Candidates

```
GET /discover?limit=10&maxDistanceKm=50
```

**Auth Required:** Yes + Complete Profile

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `limit` | number | 10 | Number of candidates to fetch |
| `maxDistanceKm` | number | null | Max distance filter (requires user to have coordinates) |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "8 candidates found",
  "data": {
    "candidates": [
      {
        "userId": "65c1...",
        "firstName": "Priya",
        "age": 26,
        "city": "Bangalore",
        "photos": {
          "silhouetteUrl": "https://s3-presigned-url...",
          "blurredUrl": "https://s3-presigned-url..."
        },
        "voiceIntro": {
          "audioUrl": "https://s3-presigned-url...",
          "duration": 22.3
        },
        "compatibility": {
          "score": 87,
          "tier": "platinum",
          "tierLabel": "Exceptional Match",
          "dimensions": {
            "emotional_vulnerability": 92,
            "attachment_patterns": 85,
            "life_vision": 78,
            "conflict_resolution": 90,
            "love_expression": 88,
            "intimacy_comfort": 82,
            "lifestyle_rhythm": 76,
            "growth_mindset": 91
          }
        },
        "showcaseAnswers": [
          {
            "questionText": "When was the last time you cried?",
            "dimension": "emotional_vulnerability",
            "depthLevel": "surface",
            "answer": "During a late-night conversation with my best friend...",
            "questionType": "text"
          },
          {
            "questionText": "How do you prefer to show love?",
            "dimension": "love_expression",
            "depthLevel": "moderate",
            "answer": "Quality time",
            "questionType": "single_choice"
          }
        ]
      }
    ]
  }
}
```

**Candidate Card Data:**
- `silhouetteUrl` - Dark silhouette outline (for the card background)
- `blurredUrl` - Blurred version of profile photo
- `voiceIntro.audioUrl` - Play button for voice intro
- `compatibility.score` - Big number (0-100) to display
- `compatibility.tier` / `tierLabel` - Badge/label for the card
- `compatibility.dimensions` - Radar/spider chart data
- `showcaseAnswers` - 3-6 question+answer pairs to display on card

**Notes:**
- Candidates are sorted by compatibility score (highest first)
- Only shows users the current user hasn't already liked/passed
- Bidirectional gender preference filtering is applied
- Age range filter: +/- 5 years from user's age

---

### 9.2 Like a User

```
POST /discover/like
```

**Auth Required:** Yes + Complete Profile

**Request Body:**
```json
{
  "targetUserId": "65c1b2c3d4e5f6a7b8c9d0e1"
}
```

**Success Response - No Match (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Like recorded",
  "data": {
    "isMutual": false,
    "match": null
  }
}
```

**Success Response - It's a Match! (201):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "It's a match! You both liked each other.",
  "data": {
    "isMutual": true,
    "match": {
      "matchId": "65d1...",
      "compatibilityScore": 87,
      "matchTier": "platinum"
    }
  }
}
```

**Frontend Logic:**
- If `isMutual: true` -> Show match celebration animation, then navigate to chat
- If `isMutual: false` -> Show next candidate card
- A `match:new` socket event is also emitted to both users on mutual match

---

### 9.3 Pass on a User

```
POST /discover/pass
```

**Auth Required:** Yes + Complete Profile

**Request Body:**
```json
{
  "targetUserId": "65c1b2c3d4e5f6a7b8c9d0e1"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Pass recorded",
  "data": null
}
```

---

### 9.4 Get Discovery Stats

```
GET /discover/stats
```

**Auth Required:** Yes + Complete Profile

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Stats retrieved",
  "data": {
    "newMatches": 3,
    "activeConnections": 5,
    "totalCandidates": 42
  }
}
```

| Field | Description |
|-------|-------------|
| `newMatches` | Matches in `mutual` stage (haven't started chatting yet) |
| `activeConnections` | Matches in `connecting`, `reveal_ready`, `revealed`, or `dating` |
| `totalCandidates` | How many more eligible users are available to discover |

---

### 9.5 Get Pending Likes

```
GET /discover/pending
```

**Auth Required:** Yes + Complete Profile

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Pending discovery states retrieved",
  "data": {
    "incoming": [
      {
        "userId": "65c2...",
        "firstName": "Aditi",
        "age": 25,
        "city": "Mumbai",
        "photos": {
          "silhouetteUrl": "https://s3-presigned-url...",
          "blurredUrl": "https://s3-presigned-url..."
        },
        "voiceIntro": {
          "audioUrl": "https://s3-presigned-url...",
          "duration": 18.5
        },
        "compatibilityScore": 79,
        "matchTier": "gold",
        "likedAt": "2026-03-09T15:30:00.000Z"
      }
    ],
    "outgoing": [
      {
        "userId": "65c3...",
        "firstName": "Ravi",
        "age": 28,
        "city": "Bangalore",
        "photos": { ... },
        "voiceIntro": { ... },
        "compatibilityScore": 72,
        "matchTier": "silver",
        "likedAt": "2026-03-08T12:00:00.000Z"
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `incoming` | Users who liked you but you haven't decided yet |
| `outgoing` | Users you liked who haven't decided yet |

---

## 10. API Reference: Matches

**All match endpoints require `profileStage === 'ready'`.**

### 10.1 List Matches

```
GET /matches?stage=connecting&page=1&limit=20
```

**Auth Required:** Yes + Complete Profile

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `stage` | string | null | Filter by stage (see Connection Stages enum) |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Results per page (max 50) |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "5 matches found",
  "data": {
    "matches": [
      {
        "matchId": "65d1...",
        "stage": "connecting",
        "compatibilityScore": 87,
        "matchTier": "platinum",
        "comfortScore": 45,
        "matchedAt": "2026-03-08T10:00:00.000Z",
        "otherUser": {
          "userId": "65c1...",
          "firstName": "Priya",
          "age": 26,
          "city": "Bangalore",
          "isOnline": true,
          "lastSeen": "2026-03-10T09:55:00.000Z",
          "voiceIntro": {
            "audioUrl": "https://s3-presigned-url...",
            "duration": 22.3
          },
          "photos": {
            "silhouetteUrl": "https://s3-presigned-url...",
            "blurredUrl": "https://s3-presigned-url..."
          }
        }
      }
    ],
    "total": 5,
    "page": 1,
    "totalPages": 1
  }
}
```

**Photo Visibility:**
- Stages `mutual`, `connecting`, `reveal_ready` -> Shows `silhouetteUrl` + `blurredUrl`
- Stages `revealed`, `dating` -> Shows `profilePhotoUrl` + `items[]` (real photos)

---

### 10.2 Get Match Detail

```
GET /matches/:matchId
```

**Auth Required:** Yes + Complete Profile

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Match retrieved",
  "data": {
    "matchId": "65d1...",
    "stage": "connecting",
    "compatibilityScore": 87,
    "matchTier": "platinum",
    "dimensionScores": {
      "emotional_vulnerability": 92,
      "attachment_patterns": 85,
      "life_vision": 78,
      "conflict_resolution": 90,
      "love_expression": 88,
      "intimacy_comfort": 82,
      "lifestyle_rhythm": 76,
      "growth_mindset": 91
    },
    "comfortScore": 45,
    "matchedAt": "2026-03-08T10:00:00.000Z",
    "revealStatus": {
      "user1": { "userId": "65a1...", "requested": true },
      "user2": { "userId": "65c1...", "requested": false },
      "revealedAt": null
    },
    "otherUser": {
      "userId": "65c1...",
      "firstName": "Priya",
      "age": 26,
      "city": "Bangalore",
      "gender": "female",
      "bio": "Love hiking and coffee",
      "isOnline": true,
      "lastSeen": "2026-03-10T09:55:00.000Z",
      "voiceIntro": {
        "audioUrl": "https://s3-presigned-url...",
        "duration": 22.3
      },
      "photos": {
        "silhouetteUrl": "https://s3-presigned-url...",
        "blurredUrl": "https://s3-presigned-url..."
      }
    }
  }
}
```

**Notes:**
- Detail view includes `dimensionScores` (for radar chart), `revealStatus`, `gender`, and `bio` (not available in list view)
- Use `revealStatus` to show reveal button state:
  - If current user's `requested: false` -> show "Request Reveal" button
  - If current user's `requested: true` but other's `false` -> show "Waiting for them..."
  - If both `true` -> photos are revealed

---

### 10.3 Advance Match Stage

```
PATCH /matches/:matchId/advance
```

**Auth Required:** Yes + Complete Profile

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Match advanced to \"reveal_ready\"",
  "data": {
    "matchId": "65d1...",
    "stage": "reveal_ready",
    "previousStage": "connecting"
  }
}
```

**Error Cases:**
- `400` - Comfort score below 70 (for `connecting` -> `reveal_ready`)
- `400` - Both users haven't requested reveal (for `reveal_ready` -> `revealed`)
- `400` - No forward transition available

---

### 10.4 Archive Match

```
PATCH /matches/:matchId/archive
```

**Auth Required:** Yes + Complete Profile

**Request Body:**
```json
{
  "reason": "one_sided"
}
```

| Field | Type | Required | Allowed Values |
|-------|------|----------|---------------|
| `reason` | string | No | `mutual`, `one_sided`, `inactivity`, `blocked`, `other` (default: `other`) |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Match archived",
  "data": {
    "matchId": "65d1...",
    "stage": "archived",
    "archiveReason": "one_sided"
  }
}
```

---

### 10.5 Request Photo Reveal

```
POST /matches/:matchId/reveal
```

**Auth Required:** Yes + Complete Profile

**Success Response - Waiting (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Reveal request sent. Waiting for the other person.",
  "data": {
    "matchId": "65d1...",
    "stage": "reveal_ready",
    "revealStatus": {
      "user1": { "userId": "65a1...", "requested": true },
      "user2": { "userId": "65c1...", "requested": false },
      "revealedAt": null
    },
    "bothRevealed": false,
    "otherUserId": "65c1..."
  }
}
```

**Success Response - Both Revealed (201):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Photos revealed! You can now see each other.",
  "data": {
    "matchId": "65d1...",
    "stage": "revealed",
    "revealStatus": {
      "user1": { "userId": "65a1...", "requested": true },
      "user2": { "userId": "65c1...", "requested": true },
      "revealedAt": "2026-03-10T11:00:00.000Z"
    },
    "bothRevealed": true,
    "otherUserId": "65c1..."
  }
}
```

**Socket Events:**
- When one user requests: `match:reveal_request` sent to other user
- When both have requested: `match:revealed` sent to both users

**Error Cases:**
- `400` - Comfort score < 70 (if in `connecting` stage)
- `400` - Already requested reveal
- `400` - Invalid stage (must be `connecting` or `reveal_ready`)

---

### 10.6 Get Comfort Score

```
GET /matches/:matchId/comfort
```

**Auth Required:** Yes + Complete Profile

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Comfort score calculated",
  "data": {
    "score": 72,
    "matchId": "65d1...",
    "updatedAt": "2026-03-10T11:00:00.000Z",
    "breakdown": {
      "messageVolume": { "value": 80, "weight": 0.15, "detail": "40 messages (target: 50)" },
      "messageDepth": { "value": 65, "weight": 0.20, "detail": "Avg 65 chars/msg (target: 100)" },
      "voiceEngagement": { "value": 60, "weight": 0.15, "detail": "3 voice messages (target: 5)" },
      "gamesCompleted": { "value": 100, "weight": 0.15, "detail": "3 games completed (target: 3)" },
      "responseConsistency": { "value": 85, "weight": 0.10, "detail": "18 vs 22 messages" },
      "activeDays": { "value": 43, "weight": 0.15, "detail": "6 active days (target: 14)" },
      "vulnerabilitySignals": { "value": 50, "weight": 0.10, "detail": "3 long msgs, 1 photos, 1 deep games" }
    }
  }
}
```

**Frontend Usage:**
- Show overall comfort score as a progress indicator (0-100)
- Threshold of **70** is required to unlock photo reveal
- Show breakdown factors as tips: "Send more voice messages" if voiceEngagement is low

---

### 10.7 Get Date Readiness

```
GET /matches/:matchId/date-readiness
```

**Auth Required:** Yes + Complete Profile

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "You two are ready for a date!",
  "data": {
    "matchId": "65d1...",
    "score": 78,
    "isReady": true,
    "breakdown": {
      "compatibility": { "value": 87, "weight": 0.35 },
      "engagement": { "value": 72, "weight": 0.20 },
      "redFlags": { "value": 80, "weight": 0.25 },
      "mutualInterest": { "value": 65, "weight": 0.20 }
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `score` | 0-100 overall readiness |
| `isReady` | `true` when score >= 70 |
| `breakdown.compatibility` | Based on match compatibility score |
| `breakdown.engagement` | Messages, games, active days |
| `breakdown.redFlags` | Inverse: one-sided messaging, inactivity (higher = fewer red flags) |
| `breakdown.mutualInterest` | Message balance, games played, reveal requests |

---

### 10.8 Get Games for Match

```
GET /matches/:matchId/games
```

**Auth Required:** Yes + Complete Profile

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "3 games found",
  "data": {
    "games": [
      {
        "gameId": "65e1...",
        "gameType": "would_you_rather",
        "status": "completed",
        "totalRounds": 5,
        "currentRound": 5,
        "createdBy": { "_id": "65a1...", "firstName": "Arjun" },
        "completedAt": "2026-03-09T18:00:00.000Z",
        "createdAt": "2026-03-09T17:30:00.000Z",
        "sessionPhase": "completed",
        "sync": { ... }
      }
    ]
  }
}
```

---

## 11. API Reference: Messages

### 11.1 List Conversations

```
GET /messages/conversations?page=1&limit=20
```

**Auth Required:** Yes

| Query Param | Type | Default |
|-------------|------|---------|
| `page` | number | 1 |
| `limit` | number | 20 |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "5 conversations found",
  "data": {
    "conversations": [
      {
        "conversationId": "65f1...",
        "matchId": "65d1...",
        "matchStage": "connecting",
        "compatibilityScore": 87,
        "matchTier": "platinum",
        "lastMessage": {
          "text": "That sounds really interesting!",
          "senderId": "65c1...",
          "sentAt": "2026-03-10T10:15:00.000Z",
          "type": "text"
        },
        "unreadCount": 3,
        "messageCount": 42,
        "otherUser": {
          "userId": "65c1...",
          "firstName": "Priya",
          "isOnline": true,
          "lastSeen": "2026-03-10T10:15:00.000Z",
          "photo": "https://s3-presigned-url..."
        },
        "updatedAt": "2026-03-10T10:15:00.000Z"
      }
    ],
    "total": 5,
    "page": 1,
    "totalPages": 1
  }
}
```

**Notes:**
- `otherUser.photo` shows silhouette/blurred before reveal, real photo after
- Sorted by most recently updated (latest message first)
- Use `unreadCount` for badge numbers

---

### 11.2 Get Messages (Paginated)

```
GET /messages/conversations/:conversationId/messages?limit=50&before=2026-03-10T10:00:00.000Z
```

**Auth Required:** Yes

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `limit` | number | 50 | Messages per page (max 50) |
| `before` | ISO date string | null | Cursor-based pagination: get messages before this timestamp |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "42 messages retrieved",
  "data": {
    "messages": [
      {
        "_id": "65g1...",
        "conversationId": "65f1...",
        "senderId": { "_id": "65a1...", "firstName": "Arjun" },
        "type": "text",
        "content": {
          "text": "Hey! Your voice intro was really genuine",
          "mediaUrl": null,
          "mediaDuration": null
        },
        "reactions": [],
        "replyTo": null,
        "readAt": "2026-03-10T10:02:00.000Z",
        "createdAt": "2026-03-10T10:00:00.000Z"
      },
      {
        "_id": "65g2...",
        "conversationId": "65f1...",
        "senderId": { "_id": "65c1...", "firstName": "Priya" },
        "type": "voice",
        "content": {
          "text": null,
          "mediaUrl": "https://s3-presigned-url...",
          "mediaDuration": 12.5
        },
        "reactions": [
          { "userId": "65a1...", "emoji": "❤️", "createdAt": "2026-03-10T10:03:00.000Z" }
        ],
        "replyTo": {
          "_id": "65g1...",
          "content": { "text": "Hey! Your voice intro was really genuine" },
          "senderId": "65a1...",
          "type": "text"
        },
        "readAt": null,
        "createdAt": "2026-03-10T10:01:00.000Z"
      },
      {
        "_id": "65g3...",
        "conversationId": "65f1...",
        "senderId": { "_id": "65a1...", "firstName": "Arjun" },
        "type": "game_invite",
        "content": {
          "text": "Let's play Would You Rather together...",
          "gameType": "would_you_rather",
          "gameSessionId": "65e1..."
        },
        "reactions": [],
        "replyTo": null,
        "readAt": null,
        "createdAt": "2026-03-10T10:05:00.000Z"
      }
    ],
    "hasMore": false
  }
}
```

**Pagination:**
- First load: omit `before` to get the most recent messages
- Load older messages: pass `before` = `createdAt` of the oldest message you have
- `hasMore: true` means there are more older messages to load

**Message Types:**
| Type | Content |
|------|---------|
| `text` | `content.text` has the message text |
| `voice` | `content.mediaUrl` has presigned S3 URL, `content.mediaDuration` in seconds |
| `image` | `content.mediaUrl` has presigned S3 URL |
| `game_invite` | `content.text` has invite text, `content.gameType`, `content.gameSessionId` |
| `system` | `content.text` has system message (e.g., "Game completed!") |

---

### 11.3 Send Message

```
POST /messages/conversations/:conversationId/messages
```

**Auth Required:** Yes

**Request Body:**

For text messages:
```json
{
  "type": "text",
  "text": "Hey, how's your day going?"
}
```

For replies:
```json
{
  "type": "text",
  "text": "Totally agree!",
  "replyTo": "65g1..."
}
```

For voice/image (after uploading media):
```json
{
  "type": "voice",
  "mediaUrl": "https://s3-url...",
  "mediaDuration": 12.5
}
```

| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| `type` | string | No (default: `text`) | `text`, `voice`, `image`, `game_invite`, `system` |
| `text` | string | For text type | Max 2000 chars |
| `mediaUrl` | string (URI) | For voice/image type | Must be valid URI |
| `mediaDuration` | number | No | 0-300 seconds |
| `replyTo` | string | No | MongoDB ObjectId of message being replied to |

**Success Response (201):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Message sent",
  "data": {
    "_id": "65g4...",
    "conversationId": "65f1...",
    "senderId": { "_id": "65a1...", "firstName": "Arjun" },
    "type": "text",
    "content": {
      "text": "Hey, how's your day going?",
      "mediaUrl": null,
      "mediaDuration": null
    },
    "reactions": [],
    "replyTo": null,
    "readAt": null,
    "createdAt": "2026-03-10T10:20:00.000Z"
  }
}
```

**Important Side Effects:**
- First message in a match auto-advances the match from `mutual` -> `connecting`
- Every 10th message triggers a comfort score recalculation
- Push notification sent to offline recipient
- `message:new` socket event broadcast to both users

---

### 11.4 Upload Message Media

```
POST /messages/conversations/:conversationId/media
```

**Auth Required:** Yes
**Content-Type:** `multipart/form-data`

| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| `file` | file | Yes | Audio or image, max 10 MB |
| `type` | string (form field) | Yes | `voice` or `image` |
| `duration` | number (form field) | No | For voice messages, duration in seconds |

**Success Response (201):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Media uploaded",
  "data": {
    "mediaUrl": "https://s3-presigned-url...",
    "mediaType": "voice",
    "mediaDuration": 12.5
  }
}
```

**Workflow:**
1. Upload media file via this endpoint -> get `mediaUrl`
2. Send message via `POST /conversations/:id/messages` with `type: "voice"` and `mediaUrl`

---

### 11.5 Mark Conversation as Read

```
PATCH /messages/conversations/:conversationId/read
```

**Auth Required:** Yes

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "3 messages marked as read",
  "data": {
    "conversationId": "65f1...",
    "messagesRead": 3,
    "readAt": "2026-03-10T10:25:00.000Z"
  }
}
```

**Notes:**
- Call this when the user opens a conversation
- Emits `message:read` socket event to the other user (for read receipts)

---

### 11.6 Add Reaction

```
POST /messages/:messageId/reactions
```

**Auth Required:** Yes

**Request Body:**
```json
{
  "emoji": "❤️"
}
```

| Field | Type | Required | Allowed Values |
|-------|------|----------|---------------|
| `emoji` | string | Yes | `❤️`, `😊`, `😂`, `😍`, `👍`, `🔥`, `😮`, `😢` |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Reaction added",
  "data": {
    "messageId": "65g1...",
    "conversationId": "65f1...",
    "reactions": [
      { "userId": "65a1...", "emoji": "❤️", "createdAt": "2026-03-10T10:30:00.000Z" }
    ]
  }
}
```

**Notes:**
- One reaction per user per message. Adding a new reaction replaces the old one.
- Emits `message:reaction` socket event.

---

### 11.7 Remove Reaction

```
DELETE /messages/:messageId/reactions
```

**Auth Required:** Yes

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Reaction removed",
  "data": {
    "messageId": "65g1...",
    "conversationId": "65f1...",
    "reactions": []
  }
}
```

---

## 12. API Reference: Games

Games are live, turn-based experiences that two matched users play together inside their chat. All game endpoints require `profileStage === 'ready'`.

### Game Flow

1. User A creates a game -> `status: pending`
2. A game invite message is auto-sent in the conversation
3. Both users mark themselves as ready -> `status: active`, countdown starts
4. Both answer each round within the time limit
5. After 5 rounds -> `status: completed`

### Session Phases

| Phase | Description | Frontend Action |
|-------|-------------|----------------|
| `waiting_room` | Game created, waiting for players to be ready | Show ready buttons |
| `countdown` | Both ready, countdown running (3 seconds) | Show countdown animation |
| `live_round` | Round is active, players answer | Show question + answer input |
| `transitioning` | Between rounds or timed out | Show round results |
| `completed` | All rounds done | Show summary screen |
| `cancelled` | Game was cancelled | Show cancelled state |

---

### 12.1 Create Game

```
POST /games
```

**Auth Required:** Yes + Complete Profile

**Request Body:**
```json
{
  "matchId": "65d1...",
  "gameType": "would_you_rather"
}
```

| Field | Type | Required | Allowed Values |
|-------|------|----------|---------------|
| `matchId` | string | Yes | Valid match ObjectId |
| `gameType` | string | Yes | See [Game Types](#game-types) below |

**Success Response (201):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Game created",
  "data": {
    "gameId": "65e1...",
    "gameType": "would_you_rather",
    "status": "pending",
    "totalRounds": 5,
    "currentRound": 0,
    "rounds": [
      {
        "roundNumber": 1,
        "prompt": {
          "text": "Would you rather...",
          "optionA": "Travel to the past",
          "optionB": "Travel to the future"
        },
        "isComplete": false
      }
    ],
    "participants": [
      { "_id": "65a1...", "firstName": "Arjun" },
      { "_id": "65c1...", "firstName": "Priya" }
    ],
    "createdBy": { "_id": "65a1...", "firstName": "Arjun" },
    "completedAt": null,
    "createdAt": "2026-03-10T11:00:00.000Z",
    "sessionPhase": "waiting_room",
    "sync": {
      "serverNow": "2026-03-10T11:00:00.000Z",
      "countdownSeconds": 3,
      "roundDurationSeconds": 30,
      "countdownStartedAt": null,
      "countdownEndsAt": null,
      "roundStartedAt": null,
      "roundEndsAt": null,
      "replayAvailableAt": "2026-03-10T12:00:00.000Z",
      "readyPlayers": [
        { "userId": "65a1...", "firstName": "Arjun", "isReady": false, "readyAt": null },
        { "userId": "65c1...", "firstName": "Priya", "isReady": false, "readyAt": null }
      ],
      "myReady": false,
      "allReady": false,
      "waitingForUserNames": ["Arjun", "Priya"]
    }
  }
}
```

**Socket Events:**
- `game:invite` sent to the other user (with push notification if offline)

**Error Cases:**
- `400` - Match not in active stage (must be `connecting`+)
- `409` - Active game of same type already exists for this match

---

### 12.2 Get Game State

```
GET /games/:gameId
```

**Auth Required:** Yes + Complete Profile

Returns the same structure as create game, with the latest state.

---

### 12.3 Set Ready State

```
POST /games/:gameId/ready
```

**Auth Required:** Yes + Complete Profile

**Request Body:**
```json
{
  "ready": true
}
```

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Ready state updated",
  "data": {
    "gameId": "65e1...",
    "gameType": "would_you_rather",
    "status": "active",
    "sessionPhase": "countdown",
    "sync": {
      "serverNow": "2026-03-10T11:01:00.000Z",
      "countdownSeconds": 3,
      "countdownStartedAt": "2026-03-10T11:01:00.000Z",
      "countdownEndsAt": "2026-03-10T11:01:03.000Z",
      "roundStartedAt": "2026-03-10T11:01:03.000Z",
      "roundEndsAt": "2026-03-10T11:01:33.000Z",
      "readyPlayers": [
        { "userId": "65a1...", "firstName": "Arjun", "isReady": true, "readyAt": "..." },
        { "userId": "65c1...", "firstName": "Priya", "isReady": true, "readyAt": "..." }
      ],
      "myReady": true,
      "allReady": true,
      "waitingForUserNames": []
    },
    ...
  }
}
```

**Notes:**
- When both players are ready, the game auto-starts with a 3-second countdown
- `countdownEndsAt` is when the round prompt should be shown
- `roundEndsAt` is the deadline to answer (auto-times out after)
- Use `serverNow` to calculate accurate timers (account for clock drift)

---

### 12.4 Submit Response

```
POST /games/:gameId/respond
```

**Auth Required:** Yes + Complete Profile

**Request Body:**
```json
{
  "answer": "A"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|-----------|
| `answer` | string | Yes | Max 1000 chars. Game-type-specific validation (see below) |

**Answer Validation by Game Type:**

| Game Type | Valid Answers |
|-----------|-------------|
| `would_you_rather` | `"A"`, `"B"`, or the full option text |
| `never_have_i_ever` | `"I have"` or `"Never"` |
| `intimacy_spectrum` | A number `"1"` to `"10"` |
| `two_truths_a_lie` | Free text (your 2 truths and 1 lie) |
| `what_would_you_do` | Free text |
| `dream_board` | Free text |
| `blind_reveal` | Free text |

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Response recorded, waiting for the other player",
  "data": {
    "gameId": "65e1...",
    "gameType": "would_you_rather",
    "status": "active",
    "currentRound": 0,
    "totalRounds": 5,
    "roundComplete": false,
    "gameComplete": false,
    "round": {
      "roundNumber": 1,
      "prompt": { "text": "Would you rather...", "optionA": "...", "optionB": "..." },
      "isComplete": false
    },
    "completedAt": null,
    "sessionPhase": "live_round",
    "sync": { ... }
  }
}
```

**When both players have answered (round complete):**
```json
{
  ...
  "roundComplete": true,
  "gameComplete": false,
  "round": {
    "roundNumber": 1,
    "prompt": { ... },
    "responses": [
      { "userId": "65a1...", "answer": "A", "answeredAt": "..." },
      { "userId": "65c1...", "answer": "B", "answeredAt": "..." }
    ],
    "isComplete": true
  },
  "currentRound": 1,
  "sessionPhase": "countdown",
  ...
}
```

**When game completes (last round):**
```json
{
  ...
  "roundComplete": true,
  "gameComplete": true,
  "status": "completed",
  "sessionPhase": "completed",
  "completedAt": "2026-03-10T11:15:00.000Z",
  ...
}
```

**Error Cases:**
- `400` - Already answered this round
- `400` - Countdown still running
- `400` - Game not active (both players need to be ready)
- `409` - Round already timed out (reload game state)

---

### 12.5 Cancel Game

```
PATCH /games/:gameId/cancel
```

**Auth Required:** Yes + Complete Profile

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Game cancelled",
  "data": {
    "gameId": "65e1...",
    "gameType": "would_you_rather",
    "status": "cancelled",
    "sessionPhase": "cancelled",
    "sync": { ... }
  }
}
```

---

### Game Types

| Type | Value | Round Duration | Replay Cooldown | Description |
|------|-------|---------------|----------------|-------------|
| Would You Rather | `would_you_rather` | 30s | 1 hour | Choose between two options |
| Never Have I Ever | `never_have_i_ever` | 30s | 1 hour | "I have" or "Never" |
| Intimacy Spectrum | `intimacy_spectrum` | 30s | 6 hours | Rate 1-10 on intimacy topics |
| Two Truths & A Lie | `two_truths_a_lie` | 60s | 1 hour | Write 2 truths and 1 lie |
| What Would You Do | `what_would_you_do` | 60s | 1 hour | Free-text scenario responses |
| Dream Board | `dream_board` | 60s | 1 hour | Free-text dream/vision answers |
| Blind Reveal | `blind_reveal` | 60s | 6 hours | Answer before seeing the reveal prompt |

---

## 13. Socket.IO Real-Time Events

### Connection Setup

```javascript
import { io } from 'socket.io-client';

const socket = io('http://<server>:<port>', {
  auth: {
    token: '<accessToken>'  // Same JWT used for REST API
  },
  // OR via query params:
  // query: { token: '<accessToken>' }
});

socket.on('connect', () => {
  console.log('Connected to real-time');
});

socket.on('connect_error', (error) => {
  // error.message could be:
  // "Authentication token required"
  // "Invalid token"
  // "Token expired"  -> refresh token and reconnect
  // "Account is inactive or banned"
});
```

### Auto Room Joining

On connection, the server automatically joins the user into all their active conversation rooms (`conversation:<conversationId>`). No manual room joining needed.

### Events: Client -> Server (Emit)

#### `message:send`
Alternative to REST API for sending messages.

```javascript
socket.emit('message:send', {
  conversationId: '65f1...',
  type: 'text',
  text: 'Hey there!',
  replyTo: null  // or messageId
}, (ack) => {
  if (ack.success) {
    // Message sent, ack.message contains the full message object
  } else {
    // Error: ack.error
  }
});
```

#### `message:read`
```javascript
socket.emit('message:read', {
  conversationId: '65f1...'
}, (ack) => {
  // ack.success, ack.data
});
```

#### `message:reaction`
```javascript
socket.emit('message:reaction', {
  messageId: '65g1...',
  emoji: '❤️'
}, (ack) => {
  // ack.success, ack.data
});
```

#### `typing:start`
```javascript
socket.emit('typing:start', {
  conversationId: '65f1...'
});
```

#### `typing:stop`
```javascript
socket.emit('typing:stop', {
  conversationId: '65f1...'
});
```

### Events: Server -> Client (Listen)

#### `message:new`
New message received in a conversation.

```javascript
socket.on('message:new', (message) => {
  // message = full message object (same as REST API response)
  // {
  //   _id, conversationId, senderId, type, content, reactions, replyTo, readAt, createdAt
  // }
});
```

#### `message:read`
Messages were marked as read by the other user.

```javascript
socket.on('message:read', (data) => {
  // {
  //   conversationId: '65f1...',
  //   readBy: '65c1...',
  //   readAt: '2026-03-10T10:25:00.000Z',
  //   messagesRead: 3
  // }
});
```

#### `message:reaction`
Reaction added/removed on a message.

```javascript
socket.on('message:reaction', (data) => {
  // {
  //   messageId: '65g1...',
  //   reactions: [{ userId, emoji, createdAt }],
  //   addedBy: '65a1...',  // or removedBy
  //   emoji: '❤️'
  // }
});
```

#### `typing:start` / `typing:stop`
```javascript
socket.on('typing:start', (data) => {
  // { conversationId: '65f1...', userId: '65c1...' }
  // Show "Priya is typing..." indicator
});

socket.on('typing:stop', (data) => {
  // { conversationId: '65f1...', userId: '65c1...' }
  // Hide typing indicator
});
```

#### `match:new`
Mutual match created.

```javascript
socket.on('match:new', (data) => {
  // {
  //   matchId: '65d1...',
  //   compatibilityScore: 87,
  //   matchTier: 'platinum'
  // }
  // Show match celebration screen!
});
```

#### `match:stage_changed`
Match advanced to new stage.

```javascript
socket.on('match:stage_changed', (data) => {
  // { matchId: '65d1...', stage: 'connecting' }
  // Update UI to reflect new stage
});
```

#### `match:reveal_request`
Other user requested photo reveal.

```javascript
socket.on('match:reveal_request', (data) => {
  // {
  //   matchId: '65d1...',
  //   requestedBy: '65c1...',
  //   requestedByName: 'Priya'
  // }
  // Show "Priya wants to reveal photos!" prompt
});
```

#### `match:revealed`
Both users have revealed photos.

```javascript
socket.on('match:revealed', (data) => {
  // { matchId: '65d1...' }
  // Show reveal animation, reload match data with real photos
});
```

#### `game:invite`
Received a game invitation.

```javascript
socket.on('game:invite', (data) => {
  // {
  //   gameId: '65e1...',
  //   gameType: 'would_you_rather',
  //   invitedBy: '65a1...',
  //   invitedByName: 'Arjun',
  //   matchId: '65d1...'
  // }
  // Show game invite in chat or as a notification
});
```

#### `game:response`
A player submitted a response.

```javascript
socket.on('game:response', (data) => {
  // {
  //   gameId: '65e1...',
  //   roundNumber: 1,
  //   respondedBy: '65c1...',
  //   roundComplete: true,
  //   gameComplete: false,
  //   round: { ... }  // Only present if roundComplete
  // }
});
```

#### `game:state_changed`
Game state updated (ready, countdown, round transition, timeout).

```javascript
socket.on('game:state_changed', (data) => {
  // Full game state object - use to sync the UI
  // {
  //   gameId, status, currentRound, totalRounds, sessionPhase, sync
  // }
});
```

#### `game:cancelled`
Game was cancelled.

```javascript
socket.on('game:cancelled', (data) => {
  // { gameId: '65e1...', cancelledBy: '65a1...' }
});
```

### Online/Offline Status

- User is marked **online** when socket connects
- User is marked **offline** 30 seconds after all sockets disconnect (grace period for reconnects)
- Online status is visible to matches via `otherUser.isOnline` and `otherUser.lastSeen`

---

## 14. Enums & Constants Reference

### Gender
```
"male" | "female" | "non-binary" | "other"
```

### Interested In
```
"men" | "women" | "everyone"
```

### Profile Stages
```
"incomplete" | "voice_pending" | "questions_pending" | "ready"
```

### Connection Stages
```
"discovered" | "liked" | "mutual" | "connecting" | "reveal_ready" | "revealed" | "dating" | "archived"
```

### Message Types
```
"text" | "voice" | "image" | "game_invite" | "system"
```

### Game Types
```
"would_you_rather" | "intimacy_spectrum" | "never_have_i_ever" | "what_would_you_do" | "dream_board" | "two_truths_a_lie" | "blind_reveal"
```

### Game Statuses
```
"pending" | "active" | "completed" | "cancelled"
```

### Session Phases
```
"waiting_room" | "countdown" | "live_round" | "transitioning" | "completed" | "cancelled"
```

### Match Tiers
```
"platinum" (85-100) - "Exceptional Match"
"gold"     (75-84)  - "Strong Match"
"silver"   (65-74)  - "Good Match"
"bronze"   (55-64)  - "Worth Exploring"
```

### Reaction Emojis
```
"❤️" | "😊" | "😂" | "😍" | "👍" | "🔥" | "😮" | "😢"
```

### Archive Reasons
```
"mutual" | "one_sided" | "inactivity" | "blocked" | "other"
```

### Question Depth Levels
```
"surface" | "moderate" | "deep" | "vulnerable"
```

### 8 Psychological Dimensions
```
"emotional_vulnerability"  (weight: 0.20)
"attachment_patterns"      (weight: 0.15)
"life_vision"              (weight: 0.12)
"conflict_resolution"      (weight: 0.13)
"love_expression"          (weight: 0.10)
"intimacy_comfort"         (weight: 0.12)
"lifestyle_rhythm"         (weight: 0.08)
"growth_mindset"           (weight: 0.10)
```

---

## 15. Photo Visibility Rules

This is critical for the frontend to display the right photo version at each stage.

| Match Stage | What to Show | Fields to Use |
|-------------|-------------|--------------|
| Before match (Discover) | Silhouette + Blurred | `photos.silhouetteUrl`, `photos.blurredUrl` |
| `mutual` | Silhouette + Blurred | `otherUser.photos.silhouetteUrl`, `otherUser.photos.blurredUrl` |
| `connecting` | Silhouette + Blurred | Same as above |
| `reveal_ready` | Silhouette + Blurred | Same as above |
| `revealed` | **Real photos** | `otherUser.photos.profilePhotoUrl`, `otherUser.photos.items[].url` |
| `dating` | **Real photos** | Same as revealed |

**Important:**
- S3 URLs are **presigned** with a 1-hour expiry. Cache them but refresh if expired (403 from S3).
- The user's OWN photos are always visible to them (via `/profile` or `/auth/me`).
- In the conversation list, `otherUser.photo` follows the same visibility rules.

---

## 16. Comfort Score System

The comfort score (0-100) measures how comfortable two matched users are with each other. It's used to gate photo reveals.

### 7 Factors

| Factor | Weight | What It Measures | Target |
|--------|--------|-----------------|--------|
| Message Volume | 0.15 | Total messages sent | 50 messages |
| Message Depth | 0.20 | Average message length | 100 chars |
| Voice Engagement | 0.15 | Voice messages sent | 5 voice messages |
| Games Completed | 0.15 | Games finished together | 3 games |
| Response Consistency | 0.10 | Balance of messages (min/max) | Equal participation |
| Active Days | 0.15 | Distinct days with messages | 14 days |
| Vulnerability Signals | 0.10 | Long messages, photos shared, deep games | Multiple signals |

### Key Threshold

**70/100** - Required to unlock photo reveal and advance from `connecting` to `reveal_ready`.

### Frontend Tips

Use the breakdown to show users helpful prompts:
- Low voiceEngagement -> "Send a voice message!"
- Low gamesCompleted -> "Play a game together!"
- Low activeDays -> "Chat every day to build your connection!"

---

## 17. Date Readiness System

The date readiness score (0-100) indicates whether a match is ready for a real-world date.

### 4 Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Compatibility | 0.35 | Match compatibility score |
| Engagement | 0.20 | Messages, games, active days, comfort |
| Red Flags | 0.25 | Inverse of: one-sided messaging, inactivity, no games |
| Mutual Interest | 0.20 | Message balance, games played, reveal requests |

### Key Threshold

**70/100** - `isReady: true` when score >= 70.

---

## 18. Compatibility & Match Tiers

Compatibility is calculated from both users' answers across 8 psychological dimensions.

### Per-Question Similarity

| Question Type | Algorithm |
|--------------|-----------|
| Single Choice | Exact match = 1.0, else 0.0 |
| Multiple Choice | Jaccard index (intersection / union) |
| Text | OpenAI embedding cosine similarity (or keyword fallback) |

### Per-Dimension Score

Weighted average of question similarities within the dimension, scaled 0-100.

### Overall Score

Weighted average of 8 dimension scores using the dimension weights, result 0-100.

### Tiers

| Tier | Score Range | Label |
|------|-----------|-------|
| Platinum | 85-100 | Exceptional Match |
| Gold | 75-84 | Strong Match |
| Silver | 65-74 | Good Match |
| Bronze | 55-64 | Worth Exploring |

---

## 19. Error Handling

### Error Response Shape

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Human-readable error description",
  "errors": [
    { "field": "phone", "message": "Phone number is required" }
  ]
}
```

### Common Error Scenarios

| Scenario | Status | Message |
|----------|--------|---------|
| Invalid/missing fields | 400 | Validation error (with `errors` array) |
| Missing auth header | 401 | "Access denied. No token provided." |
| Expired access token | 401 | "Token expired" |
| Invalid token | 401 | "Invalid token" |
| Banned/inactive user | 401 | "Account is inactive or banned" |
| Profile not complete | 403 | "Complete your profile to access this feature" |
| Question not unlocked | 403 | "Question X is not yet available" |
| Resource not found | 404 | "Match not found" / "User not found" |
| Already answered | 409 | "You've already answered question X" |
| Duplicate interaction | 409 | "Already active game of this type" |
| Rate limited | 429 | "Too many requests" |
| Self-like | 400 | "You cannot like yourself" |
| Comfort score too low | 400 | "Comfort level hasn't reached threshold" |

### Recommended Client Error Handling

```
401 -> Try refresh token. If that fails too -> force re-login
403 (profile not ready) -> Navigate to profile completion flow
429 -> Show rate limit message, retry after delay
Other 4xx -> Show error message to user
5xx -> Show generic "Something went wrong" message
```

---

## 20. Rate Limits

| Scope | Limit | Window |
|-------|-------|--------|
| Global (all endpoints) | 100 requests | 15 minutes |
| Auth endpoints (`/auth/*`) | 10 requests | 15 minutes |
| OTP resend | 1 per phone | 60 seconds |

When rate limited, the response will be:
```json
{
  "success": false,
  "statusCode": 429,
  "message": "Too many requests, please try again later"
}
```

---

## 21. Push Notifications (FCM)

### Setup

1. Integrate Firebase Cloud Messaging in your mobile app
2. On app launch, get the FCM token
3. Send it to backend via `PUT /profile/fcm-token`
4. Update the token whenever it refreshes

### Notification Types

| Event | When | Payload Shape |
|-------|------|--------------|
| New Match | Mutual like detected | `{ type: 'match', matchId, compatibilityScore, matchTier }` |
| New Message | Message sent while user is offline | `{ type: 'message', conversationId, senderName, preview }` |
| Game Invite | Game created while user is offline | `{ type: 'game_invite', matchId, gameType, inviterName }` |
| Reveal Request | Other user requested photo reveal | `{ type: 'reveal_request', matchId, requestedByName }` |

### Notification Preferences

Users can control notifications via `PUT /profile/notification-preferences`:
- `allMuted: true` -> Suppress all push notifications
- `quietHoursStart` / `quietHoursEnd` -> No notifications during these hours
- `timezone` -> Used to calculate quiet hours correctly

---

## Health Check

```
GET /api/v1/health
```

**Auth Required:** No

**Success Response (200):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Boop API is healthy",
  "data": {
    "status": "ok",
    "timestamp": "2026-03-10T10:00:00.000Z"
  }
}
```

---

## Quick Reference: Complete Endpoint List

| # | Method | Endpoint | Auth | Profile Req |
|---|--------|----------|------|-------------|
| 1 | POST | `/auth/send-otp` | No | No |
| 2 | POST | `/auth/verify-otp` | No | No |
| 3 | POST | `/auth/refresh-token` | No | No |
| 4 | POST | `/auth/logout` | Yes | No |
| 5 | GET | `/auth/me` | Yes | No |
| 6 | GET | `/profile` | Yes | No |
| 7 | PUT | `/profile/basic-info` | Yes | No |
| 8 | POST | `/profile/voice-intro` | Yes | No |
| 9 | POST | `/profile/photos` | Yes | No |
| 10 | DELETE | `/profile/photos/:index` | Yes | No |
| 11 | PUT | `/profile/photos/reorder` | Yes | No |
| 12 | PUT | `/profile/fcm-token` | Yes | No |
| 13 | PUT | `/profile/notification-preferences` | Yes | No |
| 14 | GET | `/questions` | Yes | No |
| 15 | POST | `/questions/answer` | Yes | No |
| 16 | POST | `/questions/voice-answer` | Yes | No |
| 17 | GET | `/questions/progress` | Yes | No |
| 18 | GET | `/discover` | Yes | Yes |
| 19 | POST | `/discover/like` | Yes | Yes |
| 20 | POST | `/discover/pass` | Yes | Yes |
| 21 | GET | `/discover/stats` | Yes | Yes |
| 22 | GET | `/discover/pending` | Yes | Yes |
| 23 | GET | `/matches` | Yes | Yes |
| 24 | GET | `/matches/:matchId` | Yes | Yes |
| 25 | PATCH | `/matches/:matchId/advance` | Yes | Yes |
| 26 | PATCH | `/matches/:matchId/archive` | Yes | Yes |
| 27 | POST | `/matches/:matchId/reveal` | Yes | Yes |
| 28 | GET | `/matches/:matchId/comfort` | Yes | Yes |
| 29 | GET | `/matches/:matchId/date-readiness` | Yes | Yes |
| 30 | GET | `/matches/:matchId/games` | Yes | Yes |
| 31 | GET | `/messages/conversations` | Yes | No |
| 32 | GET | `/messages/conversations/:id/messages` | Yes | No |
| 33 | POST | `/messages/conversations/:id/messages` | Yes | No |
| 34 | POST | `/messages/conversations/:id/media` | Yes | No |
| 35 | PATCH | `/messages/conversations/:id/read` | Yes | No |
| 36 | POST | `/messages/:messageId/reactions` | Yes | No |
| 37 | DELETE | `/messages/:messageId/reactions` | Yes | No |
| 38 | POST | `/games` | Yes | Yes |
| 39 | GET | `/games/:gameId` | Yes | Yes |
| 40 | POST | `/games/:gameId/ready` | Yes | Yes |
| 41 | POST | `/games/:gameId/respond` | Yes | Yes |
| 42 | PATCH | `/games/:gameId/cancel` | Yes | Yes |
| 43 | GET | `/health` | No | No |
