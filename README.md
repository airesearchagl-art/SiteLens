# SiteLens

SiteLens は、建築現場・設計監理・施工管理向けのメディア整理ツールです。

現場巡回動画、工事記録動画、ドローン映像などから記録用の静止画を抽出し、報告資料に使いやすい形へ整理します。

## VideoPress Lite Desktop との違い

VideoPress Lite Desktop は、動画を軽量化して共有しやすくする動画圧縮専用ツールです。

SiteLens は、動画・写真を報告書化しやすい形へ整理する建築現場メディア整理ツールです。

## 主な機能

- 動画ファイルの読み込み
- ドラッグ＆ドロップ対応
- ffprobe による動画情報取得
- 指定間隔での静止画抽出
- 抽出画像のサムネイル一覧表示
- 必要な画像の選択
- 選択画像のみを `Selected_Frames` へ出力
- 現場記録メタ情報の保存
- 設定保存と前回状態の復元
- FFmpeg / ffprobe 同梱
- Windows インストーラー生成
- 独自アイコン
- バージョン表示

## 対応動画形式

- mp4
- mov
- m4v
- avi
- mkv
- webm

## 静止画抽出機能

抽出間隔を選択できます。

- 5秒
- 10秒
- 30秒
- 60秒
- カスタム秒数

初期値は30秒です。

出力形式は jpg です。

出力先の初期候補は、元動画と同じフォルダ内の `SiteLens_Frames` です。

例：

```text
D:/SiteMovie/site-video.mp4
D:/SiteMovie/SiteLens_Frames/site-video_0001.jpg
```

## 現場記録メタ情報

以下の項目を入力できます。

- 工事名
- 撮影日
- 撮影者
- 場所
- メモ

抽出画像とあわせて、以下のJSONとして保存します。

```text
sitelens-project.json
```

このJSONは、将来のPowerPoint報告書生成に利用する予定です。

## セットアップ方法

```bash
npm install
```

PowerShellで npm が実行できない場合：

```bash
npm.cmd install
```

## 開発起動

```bash
npm start
```

PowerShellで npm が実行できない場合：

```bash
npm.cmd start
```

## ビルド方法

```bash
npm.cmd run dist
```

生成物：

```text
dist/
  SiteLens Setup.exe
  latest.yml
  SiteLens Setup.exe.blockmap
  win-unpacked/
```

## FFmpeg / ffprobe

Windows向けの FFmpeg / ffprobe を `resources/ffmpeg/win` に同梱します。

```text
resources/ffmpeg/win/ffmpeg.exe
resources/ffmpeg/win/ffprobe.exe
```

これらのexeはGit LFSで管理します。

## 今後の予定

- PowerPoint報告書生成
- 写真ファイルの直接読み込み
- 360度動画メタデータ対応
- 撮影位置・方角などのメタ情報管理
- 案件単位のプロジェクト管理
- GitHub Releases対応
- 自動アップデート対応

## v0.2.0

- コメント機能
- タグ機能
- 優先度管理
- CSV出力
- JSON出力
- 建築メタ情報
- フィルタ機能
