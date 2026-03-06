# FoketCrypto Signals Website

A professional cryptocurrency trading signals website with admin panel.

## Features
- Multi-language support: Korean, English, German, Japanese, Chinese, French, Spanish
- Crypto signals (free + VIP tiers)
- Subscription plans management
- News/Blog system
- Admin panel (no i18n)
- Contact form
- Live price ticker

## Database
- **MySQL**: `foketcrypto_db` (기존 EJS/관리자용)
- **MSSQL**: `FoketDB` (관리자 페이지·메인 페이지 데이터 영구 저장용)

### MSSQL 설정 (관리자/메인 데이터 DB 저장)
1. SQL Server에서 `database/schema-mssql.sql` 실행하여 `FoketDB` 및 `AppStorage` 테이블 생성.
2. `.env`에 MSSQL 접속 정보 추가 (`.env.example` 참고).
3. 서버 실행 후 `http://localhost:3000/admin.html`에서 로그인 → 종목 등 수정 후 저장 시 MSSQL에 저장됨.
4. 메인 페이지(`http://localhost:3000/index.html`)는 API에서 마켓 데이터를 불러와 표시함. **file:// 로 열면 API에 접근할 수 없으므로 반드시 서버 URL로 접속하세요.**

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Copy `.env.example` to `.env` and update your database credentials.

### 3. Setup database
```bash
node database/setup.js
```

### 4. Start server
```bash
npm start
# or for development with auto-reload:
npm run dev
```

### 5. Access
- Website: http://localhost:3000
- Admin Panel: http://localhost:3000/admin
  - Email: admin@foketcrypto.com
  - Password: Admin@123

## Structure
```
foket.com/
├── server.js          # Express server
├── config/
│   └── database.js    # MySQL connection
├── routes/
│   ├── main.js        # Public routes
│   ├── admin.js       # Admin routes
│   └── api.js         # REST API
├── views/
│   ├── index.ejs      # Homepage
│   ├── pricing.ejs    # Pricing page
│   ├── signals.ejs    # Signals page
│   ├── news.ejs       # News listing
│   ├── contact.ejs    # Contact page
│   └── admin/         # Admin templates
├── public/
│   ├── css/style.css  # Main styles
│   └── css/admin.css  # Admin styles
├── locales/           # Translation files
│   ├── ko.json  en.json  de.json
│   ├── ja.json  zh.json  fr.json  es.json
└── database/
    ├── schema.sql     # Database schema
    └── setup.js       # Setup script
```

## Languages
Add `?lang=XX` to any URL to switch language:
- `?lang=ko` Korean
- `?lang=en` English
- `?lang=de` German
- `?lang=ja` Japanese
- `?lang=zh` Chinese
- `?lang=fr` French
- `?lang=es` Spanish
