# Turborepo Monorepo (React + Express)

Turborepo を使用した React フロントエンドと Express バックエンドのモノレポ構成。

## ディレクトリ構成

```
app/
├── frontend/           # React フロントエンド
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── ...
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── backend/            # Express バックエンド
│   ├── app.ts
│   ├── package.json
│   └── tsconfig.json
├── package.json        # ルート設定（Turborepo）
├── turbo.json         # Turborepo 設定
└── app.yml            # Databricks Apps 設定
```

## セットアップ

```bash
# 依存関係のインストール
npm install

# すべてのワークスペースのビルド
npm run build

# 本番サーバー起動
npm start
```

## 開発

```bash
# すべてのワークスペースを開発モードで起動
npm run dev
```

フロントエンド: http://localhost:5173
バックエンド: http://localhost:8000

## Turborepo について

- **並列ビルド**: frontend と backend を並列でビルド
- **キャッシュ**: 変更のないパッケージのビルドをスキップ
- **依存関係**: 依存順序を自動解決

## API エンドポイント

- `GET /api/hello` - Hello メッセージ
- `GET /api/health` - ヘルスチェック

## Databricks Apps デプロイ

```bash
# ビルドを実行
npm run build

# デプロイ
databricks bundle deploy
```

## 技術スタック

- **Frontend**: React + TypeScript + Vite
- **Backend**: Express + TypeScript
- **Build**: Turborepo
- **Package Manager**: npm workspaces
