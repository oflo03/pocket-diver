# Firebase 설정 (로그인 · 클라우드 세이브 · 호스팅)

코드는 준비되어 있다(`src/cloud.js`, `firestore.rules`, `firebase.json`). 아래 설정 값을 넣기 전까지 게임은 로그인 없이 브라우저(localStorage)에만 저장한다.

## 1. 프로젝트 만들기 (Firebase 콘솔)
1. https://console.firebase.google.com 에서 프로젝트 추가.
2. **Authentication > 시작하기 > Sign-in method > Google** 사용 설정.
3. **Firestore Database > 데이터베이스 만들기**: 프로덕션 모드, 위치는 `asia-northeast3`(서울) 추천. 규칙은 4번에서 배포된다.
4. **프로젝트 설정 > 내 앱 > 웹 앱 추가(</>)**: 이름만 넣고 등록하면 `firebaseConfig`가 나온다.

## 2. 설정 값 넣기
`.env.example`을 `.env.local`로 복사하고 `firebaseConfig`의 값을 채운다(`apiKey` -> `VITE_FIREBASE_API_KEY` ...). `npm run dev`를 다시 켜면 타이틀에 Google 로그인이 뜬다. `localhost`는 Authentication의 승인된 도메인에 기본으로 들어 있다.

## 3. Firebase CLI
```
npm i -g firebase-tools
firebase login
firebase use --add
```
`firebase use --add`에서 1번에 만든 프로젝트를 고르면 `.firebaserc`가 생긴다.

## 4. 배포
```
firebase deploy
```
`npm run build`(predeploy)로 `dist/`를 만든 뒤 호스팅과 Firestore 규칙을 함께 올린다. 규칙만 올릴 때는 `firebase deploy --only firestore:rules`. 배포 주소(`<프로젝트>.web.app`)는 승인된 도메인에 자동으로 들어간다. 다른 도메인을 붙이면 Authentication > 설정 > 승인된 도메인에 추가.

## 저장 방식
- 세이브는 `users/{uid}/saves/{1|2|3}` 문서에 `{ data: 세이브 JSON, savedAt }`로 들어간다. 규칙상 본인 것만 읽고 쓸 수 있다.
- 게임은 지금처럼 5초마다 브라우저에 저장하고, 클라우드에는 최대 30초에 한 번, 그리고 타이틀로 나갈 때 바로 올린다.
- 로그인하면 슬롯마다 클라우드와 브라우저 중 더 최근(`savedAt`) 것이 반대쪽을 덮는다. 로그인 전에 만든 브라우저 세이브는 처음 로그인한 계정으로 올라가고, 클라우드 세이브에 덮이는 경우에는 `pocket-diver-backup-<슬롯>`에 남겨 둔다.
- 로그아웃하면 먼저 동기화한 뒤 이 브라우저에서 그 계정의 세이브를 지운다(오프라인이면 로그아웃하지 않는다).

## 이 게임의 실제 설정 (2026-11-03)
- 프로젝트 ID `pocket-diver-oflo`(`pocket-diver`는 다른 사람이 이미 쓰고 있었다), 호스팅 사이트 `pocket-diver` → https://pocket-diver.web.app
- `firebase.json`의 `hosting.site`가 `pocket-diver`라서 `firebase deploy`는 이 사이트로 올라간다. `.firebaserc`의 기본 프로젝트는 `pocket-diver-oflo`.
- 웹 앱 설정 값은 `.env.local`에 있다(빌드할 때 들어감).
- Firestore는 `asia-northeast3`(서울)에 만든다.
- 로그인: 처음 오면 **익명(게스트) 계정**으로 자동 로그인하고, 타이틀 오른쪽 위 "Google 계정 연결"로 같은 계정에 Google을 붙인다(세이브 그대로). 이미 다른 기기에서 쓰던 Google 계정이면 그 계정으로 로그인하고, 슬롯마다 더 최근 세이브가 남는다(덮이는 쪽은 `pocket-diver-backup-<슬롯>`). Authentication > 로그인 방법에서 **익명**과 **Google**을 둘 다 켜야 한다. 익명이 꺼져 있으면 게스트 없이 브라우저에만 저장하고 Google 로그인 버튼만 보인다.
