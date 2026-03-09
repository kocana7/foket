-- ============================================================
-- Foket Admin Storage – MSSQL Server
-- 관리자 페이지·메인 페이지 데이터 영구 저장용
-- ============================================================

-- 데이터베이스 생성 (기본 인스턴스에서 실행)
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'FoketDB')
BEGIN
  CREATE DATABASE [FoketDB]
  COLLATE Korean_Wansung_CI_AS;
END
GO

USE [FoketDB];
GO

-- ============================================================
-- AppStorage: 키-값 저장 (localStorage와 동일한 개념)
-- Key: 저장 키 (markets, markets_published, settings, signals, news 등)
-- Value: JSON 문자열 (nvarchar(max))
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'AppStorage')
BEGIN
  CREATE TABLE [dbo].[AppStorage] (
    [Key]       NVARCHAR(128)  NOT NULL,
    [Value]     NVARCHAR(MAX) NULL,
    [UpdatedAt] DATETIME2(7)   NOT NULL DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_AppStorage] PRIMARY KEY CLUSTERED ([Key])
  );

  CREATE NONCLUSTERED INDEX [IX_AppStorage_UpdatedAt] ON [dbo].[AppStorage] ([UpdatedAt]);
END
GO

-- ============================================================
-- 선택: 메인 페이지 공개용 마켓만 별도 뷰/테이블로 쿼리 편의
-- (필요 시 사용, 기본은 AppStorage만으로 충분)
-- ============================================================
-- 예: SELECT Value FROM AppStorage WHERE [Key] = N'markets_published';

PRINT N'FoketDB 및 AppStorage 테이블 생성 완료.';