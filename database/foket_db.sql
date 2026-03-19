-- ============================================================
--  FOKET.COM  |  MSSQL Database Schema
--  생성일: 2026-03-20
-- ============================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

USE master;
GO

-- DB 생성
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'FoketDB')
BEGIN
    CREATE DATABASE FoketDB
    COLLATE Korean_Wansung_CI_AS;
END
GO

USE FoketDB;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ============================================================
--  1. 카테고리 (Categories)
-- ============================================================
IF OBJECT_ID('dbo.Categories', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Categories (
        category_id     INT             IDENTITY(1,1) PRIMARY KEY,
        name            NVARCHAR(50)    NOT NULL,
        name_en         NVARCHAR(50)    NOT NULL,
        emoji           NVARCHAR(10)    NULL,
        sort_order      INT             NOT NULL DEFAULT 0,
        is_active       BIT             NOT NULL DEFAULT 1,
        created_at      DATETIME2       NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 기본 카테고리 데이터 (없을 때만 삽입)
IF NOT EXISTS (SELECT 1 FROM dbo.Categories)
BEGIN
    INSERT INTO dbo.Categories (name, name_en, emoji, sort_order) VALUES
    (N'Hot 이슈',   N'Hot Issues',    N'🔥', 1),
    (N'정치',       N'Politics',      N'🗳', 2),
    (N'스포츠',     N'Sports',        N'🏆', 3),
    (N'문화',       N'Culture',       N'🎭', 4),
    (N'트레이딩',   N'Trading',       N'📈', 5),
    (N'날씨',       N'Weather',       N'🌡', 6),
    (N'경제',       N'Economy',       N'💹', 7),
    (N'발언',       N'Statements',    N'💬', 8),
    (N'과학 & 기술',N'Science & Tech',N'🔬', 9),
    (N'나의 이웃',  N'My Neighbors',  N'🏘', 10);
END
GO

-- ============================================================
--  2. 회원 (Users)
-- ============================================================
IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        user_id         BIGINT          IDENTITY(1,1) PRIMARY KEY,
        email           NVARCHAR(255)   NOT NULL UNIQUE,
        password_hash   NVARCHAR(255)   NOT NULL,
        full_name       NVARCHAR(100)   NOT NULL,
        nickname        NVARCHAR(50)    NULL,
        phone           NVARCHAR(20)    NULL,
        grade           NVARCHAR(20)    NOT NULL DEFAULT 'NORMAL',
        balance         DECIMAL(18,2)   NOT NULL DEFAULT 0.00,
        total_traded    DECIMAL(18,2)   NOT NULL DEFAULT 0.00,
        kyc_status      NVARCHAR(20)    NOT NULL DEFAULT 'PENDING',
        kyc_verified_at DATETIME2       NULL,
        status          NVARCHAR(20)    NOT NULL DEFAULT 'ACTIVE',
        last_login_at   DATETIME2       NULL,
        created_at      DATETIME2       NOT NULL DEFAULT GETDATE(),
        updated_at      DATETIME2       NOT NULL DEFAULT GETDATE()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Users_Email' AND object_id=OBJECT_ID('dbo.Users'))
    CREATE INDEX IX_Users_Email  ON dbo.Users(email);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Users_Status' AND object_id=OBJECT_ID('dbo.Users'))
    CREATE INDEX IX_Users_Status ON dbo.Users(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Users_Grade' AND object_id=OBJECT_ID('dbo.Users'))
    CREATE INDEX IX_Users_Grade  ON dbo.Users(grade);
GO

-- ============================================================
--  3. 마켓 (Markets) - 투표 & 내기 공통
-- ============================================================
IF OBJECT_ID('dbo.Markets', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Markets (
        market_id           BIGINT          IDENTITY(1,1) PRIMARY KEY,
        category_id         INT             NOT NULL REFERENCES dbo.Categories(category_id),
        market_type         NVARCHAR(10)    NOT NULL,   -- 'VOTE' | 'BET'
        title               NVARCHAR(500)   NOT NULL,
        description         NVARCHAR(MAX)   NULL,
        status              NVARCHAR(20)    NOT NULL DEFAULT 'PENDING',
        start_at            DATETIME2       NOT NULL DEFAULT GETDATE(),
        end_at              DATETIME2       NOT NULL,
        settled_at          DATETIME2       NULL,
        settlement_rule     NVARCHAR(MAX)   NULL,
        total_volume        DECIMAL(18,2)   NOT NULL DEFAULT 0.00,
        participant_count   INT             NOT NULL DEFAULT 0,
        created_by          BIGINT          NULL,
        created_at          DATETIME2       NOT NULL DEFAULT GETDATE(),
        updated_at          DATETIME2       NOT NULL DEFAULT GETDATE()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Markets_Category' AND object_id=OBJECT_ID('dbo.Markets'))
    CREATE INDEX IX_Markets_Category ON dbo.Markets(category_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Markets_Type' AND object_id=OBJECT_ID('dbo.Markets'))
    CREATE INDEX IX_Markets_Type     ON dbo.Markets(market_type);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Markets_Status' AND object_id=OBJECT_ID('dbo.Markets'))
    CREATE INDEX IX_Markets_Status   ON dbo.Markets(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Markets_EndAt' AND object_id=OBJECT_ID('dbo.Markets'))
    CREATE INDEX IX_Markets_EndAt    ON dbo.Markets(end_at);
GO

-- ============================================================
--  4. 내기 상세 (BetMarkets)
-- ============================================================
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('dbo.BetMarkets', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BetMarkets (
        bet_market_id       BIGINT          IDENTITY(1,1) PRIMARY KEY,
        market_id           BIGINT          NOT NULL UNIQUE REFERENCES dbo.Markets(market_id),
        yes_price           DECIMAL(5,2)    NOT NULL DEFAULT 50.00,
        no_price            AS (CAST(100.00 AS DECIMAL(5,2)) - yes_price) PERSISTED,
        min_bet_amount      DECIMAL(18,2)   NOT NULL DEFAULT 1.00,
        max_bet_amount      DECIMAL(18,2)   NULL,
        yes_pool            DECIMAL(18,2)   NOT NULL DEFAULT 0.00,
        no_pool             DECIMAL(18,2)   NOT NULL DEFAULT 0.00,
        result              NVARCHAR(10)    NULL
    );
END
GO

-- ============================================================
--  5. 투표 선택지 (VoteOptions)
-- ============================================================
IF OBJECT_ID('dbo.VoteOptions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.VoteOptions (
        option_id       BIGINT          IDENTITY(1,1) PRIMARY KEY,
        market_id       BIGINT          NOT NULL REFERENCES dbo.Markets(market_id),
        option_text     NVARCHAR(200)   NOT NULL,
        sort_order      INT             NOT NULL DEFAULT 0,
        vote_count      INT             NOT NULL DEFAULT 0,
        is_winner       BIT             NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_VoteOptions_Market' AND object_id=OBJECT_ID('dbo.VoteOptions'))
    CREATE INDEX IX_VoteOptions_Market ON dbo.VoteOptions(market_id);
GO

-- ============================================================
--  6. 투표 참여 (VoteResponses)
-- ============================================================
IF OBJECT_ID('dbo.VoteResponses', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.VoteResponses (
        response_id     BIGINT          IDENTITY(1,1) PRIMARY KEY,
        market_id       BIGINT          NOT NULL REFERENCES dbo.Markets(market_id),
        user_id         BIGINT          NOT NULL REFERENCES dbo.Users(user_id),
        option_id       BIGINT          NOT NULL REFERENCES dbo.VoteOptions(option_id),
        voted_at        DATETIME2       NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_VoteResponse UNIQUE (market_id, user_id)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_VoteResponses_Market' AND object_id=OBJECT_ID('dbo.VoteResponses'))
    CREATE INDEX IX_VoteResponses_Market ON dbo.VoteResponses(market_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_VoteResponses_User' AND object_id=OBJECT_ID('dbo.VoteResponses'))
    CREATE INDEX IX_VoteResponses_User   ON dbo.VoteResponses(user_id);
GO

-- ============================================================
--  7. 내기 거래 (Trades)
-- ============================================================
IF OBJECT_ID('dbo.Trades', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Trades (
        trade_id            BIGINT          IDENTITY(1,1) PRIMARY KEY,
        market_id           BIGINT          NOT NULL REFERENCES dbo.Markets(market_id),
        user_id             BIGINT          NOT NULL REFERENCES dbo.Users(user_id),
        side                NVARCHAR(3)     NOT NULL,
        price               DECIMAL(5,2)    NOT NULL,
        amount              DECIMAL(18,2)   NOT NULL,
        contracts           INT             NOT NULL,
        max_profit          DECIMAL(18,2)   NOT NULL,
        status              NVARCHAR(20)    NOT NULL DEFAULT 'OPEN',
        settled_amount      DECIMAL(18,2)   NULL,
        traded_at           DATETIME2       NOT NULL DEFAULT GETDATE(),
        settled_at          DATETIME2       NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Trades_Market' AND object_id=OBJECT_ID('dbo.Trades'))
    CREATE INDEX IX_Trades_Market   ON dbo.Trades(market_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Trades_User' AND object_id=OBJECT_ID('dbo.Trades'))
    CREATE INDEX IX_Trades_User     ON dbo.Trades(user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Trades_Status' AND object_id=OBJECT_ID('dbo.Trades'))
    CREATE INDEX IX_Trades_Status   ON dbo.Trades(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Trades_TradedAt' AND object_id=OBJECT_ID('dbo.Trades'))
    CREATE INDEX IX_Trades_TradedAt ON dbo.Trades(traded_at DESC);
GO

-- ============================================================
--  8. 잔액 거래내역 (Transactions)
-- ============================================================
IF OBJECT_ID('dbo.Transactions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Transactions (
        tx_id           BIGINT          IDENTITY(1,1) PRIMARY KEY,
        user_id         BIGINT          NOT NULL REFERENCES dbo.Users(user_id),
        tx_type         NVARCHAR(20)    NOT NULL,
        amount          DECIMAL(18,2)   NOT NULL,
        balance_before  DECIMAL(18,2)   NOT NULL,
        balance_after   DECIMAL(18,2)   NOT NULL,
        ref_id          BIGINT          NULL,
        memo            NVARCHAR(255)   NULL,
        created_at      DATETIME2       NOT NULL DEFAULT GETDATE()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Transactions_User' AND object_id=OBJECT_ID('dbo.Transactions'))
    CREATE INDEX IX_Transactions_User      ON dbo.Transactions(user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Transactions_Type' AND object_id=OBJECT_ID('dbo.Transactions'))
    CREATE INDEX IX_Transactions_Type      ON dbo.Transactions(tx_type);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Transactions_CreatedAt' AND object_id=OBJECT_ID('dbo.Transactions'))
    CREATE INDEX IX_Transactions_CreatedAt ON dbo.Transactions(created_at DESC);
GO

-- ============================================================
--  9. 출금 요청 (Withdrawals)
-- ============================================================
IF OBJECT_ID('dbo.Withdrawals', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Withdrawals (
        withdrawal_id   BIGINT          IDENTITY(1,1) PRIMARY KEY,
        user_id         BIGINT          NOT NULL REFERENCES dbo.Users(user_id),
        amount          DECIMAL(18,2)   NOT NULL,
        method          NVARCHAR(30)    NOT NULL,
        account_info    NVARCHAR(500)   NULL,
        status          NVARCHAR(20)    NOT NULL DEFAULT 'PENDING',
        risk_score      NVARCHAR(10)    NULL,
        reviewed_by     BIGINT          NULL,
        reviewed_at     DATETIME2       NULL,
        memo            NVARCHAR(255)   NULL,
        requested_at    DATETIME2       NOT NULL DEFAULT GETDATE(),
        completed_at    DATETIME2       NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Withdrawals_User' AND object_id=OBJECT_ID('dbo.Withdrawals'))
    CREATE INDEX IX_Withdrawals_User   ON dbo.Withdrawals(user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Withdrawals_Status' AND object_id=OBJECT_ID('dbo.Withdrawals'))
    CREATE INDEX IX_Withdrawals_Status ON dbo.Withdrawals(status);
GO

-- ============================================================
--  10. 컴플라이언스 플래그 (ComplianceFlags)
-- ============================================================
IF OBJECT_ID('dbo.ComplianceFlags', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ComplianceFlags (
        flag_id         BIGINT          IDENTITY(1,1) PRIMARY KEY,
        user_id         BIGINT          NOT NULL REFERENCES dbo.Users(user_id),
        flag_type       NVARCHAR(50)    NOT NULL,
        description     NVARCHAR(MAX)   NULL,
        severity        NVARCHAR(10)    NOT NULL DEFAULT 'MEDIUM',
        status          NVARCHAR(20)    NOT NULL DEFAULT 'OPEN',
        resolved_by     BIGINT          NULL,
        resolved_at     DATETIME2       NULL,
        created_at      DATETIME2       NOT NULL DEFAULT GETDATE()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ComplianceFlags_User' AND object_id=OBJECT_ID('dbo.ComplianceFlags'))
    CREATE INDEX IX_ComplianceFlags_User     ON dbo.ComplianceFlags(user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ComplianceFlags_Status' AND object_id=OBJECT_ID('dbo.ComplianceFlags'))
    CREATE INDEX IX_ComplianceFlags_Status   ON dbo.ComplianceFlags(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ComplianceFlags_Severity' AND object_id=OBJECT_ID('dbo.ComplianceFlags'))
    CREATE INDEX IX_ComplianceFlags_Severity ON dbo.ComplianceFlags(severity);
GO

-- ============================================================
--  11. 관리자 계정 (Admins)
-- ============================================================
IF OBJECT_ID('dbo.Admins', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Admins (
        admin_id        INT             IDENTITY(1,1) PRIMARY KEY,
        email           NVARCHAR(255)   NOT NULL UNIQUE,
        password_hash   NVARCHAR(255)   NOT NULL,
        name            NVARCHAR(100)   NOT NULL,
        role            NVARCHAR(20)    NOT NULL DEFAULT 'MANAGER',
        is_active       BIT             NOT NULL DEFAULT 1,
        last_login_at   DATETIME2       NULL,
        created_at      DATETIME2       NOT NULL DEFAULT GETDATE()
    );
END
GO

-- 기본 관리자 계정 (없을 때만)
IF NOT EXISTS (SELECT 1 FROM dbo.Admins)
BEGIN
    INSERT INTO dbo.Admins (email, password_hash, name, role) VALUES
    (N'admin@foket.com',      N'CHANGE_ME_HASHED', N'최고 관리자',        N'SUPER_ADMIN'),
    (N'ops@foket.com',        N'CHANGE_ME_HASHED', N'운영 매니저',        N'MANAGER'),
    (N'compliance@foket.com', N'CHANGE_ME_HASHED', N'컴플라이언스 분석가', N'ANALYST');
END
GO

-- ============================================================
--  12. 관리자 활동 로그 (AdminLogs)
-- ============================================================
IF OBJECT_ID('dbo.AdminLogs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AdminLogs (
        log_id          BIGINT          IDENTITY(1,1) PRIMARY KEY,
        admin_id        INT             NOT NULL REFERENCES dbo.Admins(admin_id),
        action          NVARCHAR(100)   NOT NULL,
        target_type     NVARCHAR(30)    NULL,
        target_id       BIGINT          NULL,
        detail          NVARCHAR(MAX)   NULL,
        ip_address      NVARCHAR(45)    NULL,
        created_at      DATETIME2       NOT NULL DEFAULT GETDATE()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_AdminLogs_Admin' AND object_id=OBJECT_ID('dbo.AdminLogs'))
    CREATE INDEX IX_AdminLogs_Admin     ON dbo.AdminLogs(admin_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_AdminLogs_CreatedAt' AND object_id=OBJECT_ID('dbo.AdminLogs'))
    CREATE INDEX IX_AdminLogs_CreatedAt ON dbo.AdminLogs(created_at DESC);
GO

-- ============================================================
--  뷰 (Views)
-- ============================================================

-- 마켓 목록 (카테고리명 포함)
CREATE OR ALTER VIEW dbo.vw_MarketList AS
SELECT
    m.market_id,
    m.market_type,
    c.name          AS category_name,
    c.emoji         AS category_emoji,
    m.title,
    m.status,
    m.start_at,
    m.end_at,
    m.total_volume,
    m.participant_count,
    bm.yes_price,
    bm.no_price,
    bm.result
FROM dbo.Markets m
JOIN dbo.Categories c ON m.category_id = c.category_id
LEFT JOIN dbo.BetMarkets bm ON m.market_id = bm.market_id;
GO

-- 회원 요약 뷰
CREATE OR ALTER VIEW dbo.vw_UserSummary AS
SELECT
    u.user_id,
    u.email,
    u.full_name,
    u.grade,
    u.balance,
    u.total_traded,
    u.kyc_status,
    u.status,
    u.created_at,
    COUNT(t.trade_id)       AS trade_count,
    COUNT(w.withdrawal_id)  AS withdrawal_count
FROM dbo.Users u
LEFT JOIN dbo.Trades t       ON u.user_id = t.user_id
LEFT JOIN dbo.Withdrawals w  ON u.user_id = w.user_id
GROUP BY u.user_id, u.email, u.full_name, u.grade,
         u.balance, u.total_traded, u.kyc_status, u.status, u.created_at;
GO

-- 카테고리별 거래량 집계 뷰
CREATE OR ALTER VIEW dbo.vw_CategoryVolume AS
SELECT
    c.category_id,
    c.name          AS category_name,
    c.emoji,
    COUNT(m.market_id)       AS market_count,
    ISNULL(SUM(m.total_volume), 0)      AS total_volume,
    ISNULL(SUM(m.participant_count), 0) AS total_participants
FROM dbo.Categories c
LEFT JOIN dbo.Markets m ON c.category_id = m.category_id AND m.status != 'SUSPENDED'
GROUP BY c.category_id, c.name, c.emoji;
GO

-- ============================================================
--  저장 프로시저 (Stored Procedures)
-- ============================================================

-- 내기 거래 처리
CREATE OR ALTER PROCEDURE dbo.sp_PlaceTrade
    @market_id  BIGINT,
    @user_id    BIGINT,
    @side       NVARCHAR(3),    -- 'YES' | 'NO'
    @amount     DECIMAL(18,2)
AS
BEGIN
    SET NOCOUNT ON;
    SET QUOTED_IDENTIFIER ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @price          DECIMAL(5,2);
        DECLARE @contracts      INT;
        DECLARE @max_profit_val DECIMAL(18,2);
        DECLARE @balance        DECIMAL(18,2);
        DECLARE @bal_before     DECIMAL(18,2);

        -- 잔액 확인
        SELECT @balance = balance FROM dbo.Users WITH (UPDLOCK) WHERE user_id = @user_id;
        IF @balance < @amount
            THROW 50001, N'잔액이 부족합니다.', 1;

        -- 마켓 상태 확인
        IF NOT EXISTS (SELECT 1 FROM dbo.Markets WHERE market_id = @market_id AND status = 'ACTIVE')
            THROW 50002, N'활성 마켓이 아닙니다.', 1;

        -- 가격 조회
        SELECT @price = CASE WHEN @side = 'YES' THEN yes_price ELSE no_price END
        FROM dbo.BetMarkets WHERE market_id = @market_id;

        SET @contracts      = FLOOR(@amount / (@price / 100.0));
        SET @max_profit_val = @contracts * (1.0 - @price / 100.0);
        SET @bal_before     = @balance;

        -- 잔액 차감
        UPDATE dbo.Users SET balance = balance - @amount, updated_at = GETDATE()
        WHERE user_id = @user_id;

        -- 거래 생성
        INSERT INTO dbo.Trades (market_id, user_id, side, price, amount, contracts, max_profit)
        VALUES (@market_id, @user_id, @side, @price, @amount, @contracts, @max_profit_val);

        -- 풀 업데이트
        IF @side = 'YES'
            UPDATE dbo.BetMarkets SET yes_pool = yes_pool + @amount WHERE market_id = @market_id;
        ELSE
            UPDATE dbo.BetMarkets SET no_pool = no_pool + @amount WHERE market_id = @market_id;

        -- 마켓 거래량/참여자 업데이트
        UPDATE dbo.Markets
        SET total_volume      = total_volume + @amount,
            participant_count = participant_count + 1,
            updated_at        = GETDATE()
        WHERE market_id = @market_id;

        -- 유저 누적 거래량 업데이트
        UPDATE dbo.Users SET total_traded = total_traded + @amount WHERE user_id = @user_id;

        -- 거래내역 기록
        INSERT INTO dbo.Transactions (user_id, tx_type, amount, balance_before, balance_after, memo)
        VALUES (@user_id, N'TRADE_BUY', -@amount, @bal_before, @bal_before - @amount,
                N'내기 참여: market_id=' + CAST(@market_id AS NVARCHAR));

        COMMIT TRANSACTION;
        SELECT N'SUCCESS' AS result;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- 출금 요청 처리
CREATE OR ALTER PROCEDURE dbo.sp_RequestWithdrawal
    @user_id        BIGINT,
    @amount         DECIMAL(18,2),
    @method         NVARCHAR(30),
    @account_info   NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @balance    DECIMAL(18,2);
        DECLARE @risk       NVARCHAR(10);

        SELECT @balance = balance FROM dbo.Users WITH (UPDLOCK) WHERE user_id = @user_id;
        IF @balance < @amount
            THROW 50001, N'잔액이 부족합니다.', 1;

        -- 위험도 자동 산정
        SET @risk = CASE
            WHEN @amount >= 1000000 THEN N'HIGH'
            WHEN @amount >= 100000  THEN N'MEDIUM'
            ELSE N'LOW'
        END;

        -- 잔액 차감
        UPDATE dbo.Users SET balance = balance - @amount, updated_at = GETDATE()
        WHERE user_id = @user_id;

        -- 출금 요청 생성
        INSERT INTO dbo.Withdrawals (user_id, amount, method, account_info, risk_score)
        VALUES (@user_id, @amount, @method, @account_info, @risk);

        -- 거래내역 기록
        INSERT INTO dbo.Transactions (user_id, tx_type, amount, balance_before, balance_after, memo)
        VALUES (@user_id, N'WITHDRAWAL', -@amount, @balance, @balance - @amount,
                N'출금 요청: ' + @method);

        COMMIT TRANSACTION;
        SELECT N'SUCCESS' AS result, @risk AS risk_score;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

PRINT N'FoketDB 생성 완료';
GO
