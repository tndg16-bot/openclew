# OpenClaw エージェント経済圏 実装ロードマップ

`OPENCLAW_ECOSYSTEM_VISION.md` で描かれた「自律的に稼ぐAIエージェント」を、現在のローカルClawdbot環境から構築していくための工程表です。

## 📅 全体スケジュール概要

| フェーズ | 期間 | テーマ | 目標 |
|---|---|---|---|
| **Phase 1** | 1ヶ月目 | **Wallet & Identity** | エージェントに財布（Base Wallet）と身分（ID）を持たせる |
| **Phase 2** | 2-3ヶ月目 | **DeFi & Trading** | 自律的に資産運用・交換ができるようにする |
| **Phase 3** | 4-5ヶ月目 | **Social & Networking** | エージェントSNSに参加し、情報収集・発信を行う |
| **Phase 4** | 6ヶ月目〜 | **Labor & Economy** | 仕事を受注し、x402プロトコルで報酬を得る |

---

## 🛠️ 作業工程詳細

### Phase 1: インフラ構築 (Wallet & Identity)
**目標**: ClawdbotがBaseブロックチェーン上のウォレットを持ち、残高確認や送金ができる。

1. **[Skill] Base Walletの実装** (`skills/base-wallet/`)
   - `ethers.js` または `viem` を導入。
   - 秘密鍵の生成と安全な管理（ローカル暗号化保存）。
   - 機能:
     - `create_wallet`: アドレス生成。
     - `get_balance`: Base ETH残高確認。
     - `send_transaction`: 送金機能。
2. **[Infra] RPC設定**
   - Base Mainnetのエンドポイント接続設定。

### Phase 2: 経済活動 (DeFi & Trading)
**目標**: DEX（分散型取引所）を使ってトークンをスワップしたり、NFTを発行する。

1. **[Skill] DEX Trader** (`skills/dex-trader/`)
   - Uniswap / Aerodrome のルーターコントラクト連携。
   - 機能:
     - `swap_tokens`: ETHとUSDCの交換など。
     - `get_token_price`: 価格情報の取得。
2. **[Skill] NFT Creator** (`skills/nft-creator/`)
   - 画像生成AI（DALL-E3等）との連携。
   - Zora / OpenSea APIを使ったNFTミント・出品自動化。
3. **[Agent] Trader Agentの育成**
   - 「価格が○○になったら売る」といった戦略を実行させるためのCron設定。

### Phase 3: 社会進出 (Social & Networking)
**目標**: エージェントSNS（Farcaster等）に参加し、存在感を高める。

1. **[Skill] Farcaster Connector** (`skills/farcaster-client/`)
   - Farcaster API (Neynar等) の利用。
   - 機能:
     - `cast_message`: 投稿機能。
     - `read_timeline`: 他のエージェントの発言収集。
2. **[Agent] Social Persona**
   - 特定のキャラクター性（人格）を持たせ、定期的に市場状況や自身の活動について投稿させる。

### Phase 4: 労働市場 (Labor & Economy)
**目標**: 外部からの依頼を受け、API経由で報酬を得る（x402）。

1. **[Skill] x402 Server**
   - 簡易的なHTTPサーバーを立ち上げる。
   - 「402 Payment Required」を返し、Lightning NetworkやBaseトークンでの支払いを検知してAPIを開放する仕組みの実装。
2. **[Integration] OpenWork連携**
   - `@openworkceo` のようなマーケットプレイスAPIへの接続。
   - 仕事の検索と入札（Bit）の自動化。

---

## 💼 必要なリソース・準備

1. **開発資金 (Gas代)**
   - Base ETH（少額でOK）
2. **開発者アカウント**
   - Coinbase Developer Platform (CDP) API Key
   - Neynar API Key (Farcaster用)
3. **セキュリティ**
   - 秘密鍵は環境変数または暗号化ファイルでのみ管理し、絶対に流出させない仕組みが必要。

## 🚀 次のアクション（Start Small）

まずは **Phase 1: Base Walletの実装** から始めることを推奨します。
「Clawdbot、自分のウォレット作って」の一言から、全てが始まります。
