# Kenpro Movies v3.2 — Firebase Setup

## THE FIX: Why phone couldn't see PC uploads
Movies were saved in localStorage (PC only). Now they use Firebase — upload on PC, see on every phone instantly.

## STEP 1: Get Firebase config
1. Go to https://console.firebase.google.com → your kenpro-movies project
2. Gear icon → Project Settings → Your apps → web app </>
3. Copy the firebaseConfig values
4. Open index.html, find "YOUR FIREBASE CONFIG" section, replace the placeholder values

## STEP 2: Enable in Firebase Console
- Firestore Database → Create database → test mode
- Storage → Get started → test mode

## STEP 3: Deploy to Netlify
Drag the kenpro folder to https://app.netlify.com → Deploy manually

## SECRET ADMIN ACCESS
Admin icon is hidden from users.
To reveal: Settings page → tap "About" row 7 times quickly
Password: kenpro123
Tap 7 times again to hide it.

## ADMIN FEATURES
- Single form for Movies, Series episodes, Animation
- Upload thumbnail image directly (no URL needed)
- Series: use same series name for all episodes, season/episode auto-increments
- Edit any content (title, thumbnail, links, VJ, etc.)
- Delete with confirmation
- All changes sync to every device in real-time
