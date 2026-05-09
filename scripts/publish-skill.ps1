#!/usr/bin/env pwsh
<#
.SYNOPSIS
  从 monorepo 发布单个 Skill 到独立 GitHub 仓库 + ClawHub

.DESCRIPTION
  Monorepo 是唯一开发源。此脚本将指定 skill 的子目录推送到其独立仓库，
  然后发布到 ClawHub。独立仓库只做发布镜像——不在独立仓库里直接改代码。

.PARAMETER SkillSlug
  Skill 的 slug 名称，如 ocean-chat、ocean-agent

.PARAMETER Version
  发布的版本号，semver 格式。脚本会检查 SKILL.md 中的版本号与此一致

.PARAMETER Changelog
  更新日志（可选）

.EXAMPLE
  ./scripts/publish-skill.ps1 -SkillSlug ocean-chat -Version 2.9.3 -Changelog "修复 Roster 重复检测"

.EXAMPLE
  ./scripts/publish-skill.ps1 captain-lobster 1.4.2

.NOTES
  前置条件：
  1. git remote 已添加独立仓库（首次使用需运行 publish-skill.ps1 -SkillSlug xxx -SetupRemote）
  2. clawhub CLI 已安装且已登录
  3. 在 monorepo 根目录执行
#>

param(
  [Parameter(Position = 0, Mandatory = $true)]
  [string]$SkillSlug,

  [Parameter(Position = 1, Mandatory = $true)]
  [string]$Version,

  [Parameter(Position = 2)]
  [string]$Changelog = "版本更新",

  [switch]$SetupRemote,

  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# ── 配置 ──────────────────────────────────────────────────────
$MonorepoRoot = (Get-Location).Path
$SkillDir = Join-Path $MonorepoRoot "skills" $SkillSlug
$GitHubUser = "ryanbihai"
$RepoUrl = "https://github.com/${GitHubUser}/${SkillSlug}.git"

# ClawHub 显示名称映射
$ClawHubNames = @{
  "ocean-chat"                  = "Ocean Chat"
  "ocean-agent"                 = "Ocean Agent"
  "captain-lobster"             = "Captain Lobster"
  "guess-ai"                    = "Guess AI"
  "china-top-doctor-referral"  = "China Top Doctor Referral"
  "health-checkup-recommender" = "Health Checkup Recommender"
  "ocean-desk"                  = "Ocean Desk"
}
$ClawHubName = if ($ClawHubNames.ContainsKey($SkillSlug)) { $ClawHubNames[$SkillSlug] } else { $SkillSlug }

# ── 验证 ──────────────────────────────────────────────────────
if (-not (Test-Path $SkillDir)) {
  Write-Error "Skill 目录不存在: $SkillDir"
  exit 1
}

$SkillMdPath = Join-Path $SkillDir "SKILL.md"
if (-not (Test-Path $SkillMdPath)) {
  Write-Error "SKILL.md 不存在: $SkillMdPath"
  exit 1
}

# 验证 SKILL.md 中的版本号
$skillContent = Get-Content $SkillMdPath -Raw
if ($skillContent -match "version:\s*([0-9.]+)") {
  $skillMdVersion = $Matches[1]
  if ($skillMdVersion -ne $Version) {
    Write-Warning "SKILL.md 中版本号 ($skillMdVersion) 与传入版本 ($Version) 不一致"
    Write-Warning "建议先更新 SKILL.md 中的 version 字段再发布"
    $confirm = Read-Host "继续？(y/n)"
    if ($confirm -ne "y") { exit 1 }
  }
} else {
  Write-Warning "无法从 SKILL.md 中提取版本号"
}

# ── 一次性设置 remote ─────────────────────────────────────────
if ($SetupRemote) {
  Write-Host "━━━ 设置 remote: $SkillSlug ━━━" -ForegroundColor Cyan
  $remoteName = "skill-$SkillSlug"
  $existing = git remote | Where-Object { $_ -eq $remoteName }
  if ($existing) {
    git remote remove $remoteName
    Write-Host "  已移除旧 remote: $remoteName"
  }
  git remote add $remoteName $RepoUrl
  Write-Host "  ✅ remote '$remoteName' -> $RepoUrl"
  Write-Host "  现在可以运行: ./scripts/publish-skill.ps1 $SkillSlug $Version" -ForegroundColor Green
  exit 0
}

$remoteName = "skill-$SkillSlug"

# ── 检查 remote 是否已配置 ────────────────────────────────────
$remotes = git remote
if ($remotes -notcontains $remoteName) {
  Write-Error "Remote '$remoteName' 未配置。请先运行: ./scripts/publish-skill.ps1 -SkillSlug $SkillSlug -SetupRemote"
  exit 1
}

# ── 确认 ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  发布 $SkillSlug v$Version" -ForegroundColor Yellow
Write-Host "  Monorepo: skills/$SkillSlug" -ForegroundColor Gray
Write-Host "  Target:   $RepoUrl" -ForegroundColor Gray
Write-Host "  ClawHub:  $ClawHubName" -ForegroundColor Gray
Write-Host "  Changelog: $Changelog" -ForegroundColor Gray
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

if (-not $DryRun) {
  $confirm = Read-Host "确认发布？(y/n)"
  if ($confirm -ne "y") { Write-Host "已取消"; exit 0 }
}

# ── 步骤 1: 用 git subtree push 推到独立仓库 ──────────────────
Write-Host "`n[1/3] 推送 skill 子目录到独立仓库..." -ForegroundColor Yellow

if (-not $DryRun) {
  $subtreePrefix = "skills/$SkillSlug"

  # subtree push: 将子目录的历史提取并推送到独立仓库的 main 分支
  # --squash 可选：将 monorepo 中的多次提交压缩为一个
  try {
    git subtree push --prefix=$subtreePrefix $remoteName main
    if ($LASTEXITCODE -ne 0) {
      # subtree push 失败时，尝试 force push（独立仓库是发布镜像，force 安全）
      Write-Warning "普通 push 失败，尝试 split + force push..."
      $splitBranch = "split-$SkillSlug"
      git subtree split --prefix=$subtreePrefix -b $splitBranch
      git push $remoteName "${splitBranch}:main" --force
      git branch -D $splitBranch
    }
  } catch {
    Write-Error "git subtree push 失败: $_"
    exit 1
  }
  Write-Host "  ✅ 已推送到 $RepoUrl" -ForegroundColor Green
}

# ── 步骤 2: 更新独立仓库中的版本号标记 ─────────────────────────
Write-Host "`n[2/3] 打版本 tag..." -ForegroundColor Yellow

if (-not $DryRun) {
  $tempDir = Join-Path $env:TEMP "oceanbus-publish-$SkillSlug"
  if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }

  git clone $RepoUrl $tempDir 2>&1 | Out-Null
  Push-Location $tempDir
  git tag "v$Version" -m "$SkillSlug v$Version — $Changelog"
  git push origin "v$Version"
  Pop-Location
  Remove-Item $tempDir -Recurse -Force
  Write-Host "  ✅ tag v$Version 已推送" -ForegroundColor Green
}

# ── 步骤 3: 发布到 ClawHub ─────────────────────────────────────
Write-Host "`n[3/3] 发布到 ClawHub..." -ForegroundColor Yellow

if (-not $DryRun) {
  $tempDir = Join-Path $env:TEMP "oceanbus-publish-$SkillSlug"
  git clone $RepoUrl $tempDir 2>&1 | Out-Null

  Push-Location $tempDir
  try {
    clawhub publish . `
      --slug $SkillSlug `
      --name $ClawHubName `
      --version $Version `
      --changelog $Changelog

    if ($LASTEXITCODE -eq 0) {
      Write-Host "  ✅ ClawHub 发布成功: https://clawhub.ai/skills/$SkillSlug" -ForegroundColor Green
    } else {
      Write-Warning "ClawHub 发布可能失败（exit code: $LASTEXITCODE），请检查"
    }
  } finally {
    Pop-Location
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# ── 完成 ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  $SkillSlug v$Version 发布完成" -ForegroundColor Green
Write-Host "  GitHub:  $RepoUrl/releases/tag/v$Version"
Write-Host "  ClawHub: https://clawhub.ai/skills/$SkillSlug"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
