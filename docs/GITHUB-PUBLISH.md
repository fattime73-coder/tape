# GitHubで公開する手順

このパッケージには、アプリのソースとGitHub Pages公開用ワークフローを含めています。
GitHubへのアップロードとPagesの有効化は別の手順です。

## 新しいリポジトリ

1. GitHubにログインして [新しいリポジトリを作成](https://github.com/new?name=tape&visibility=public&auto_init=true) を開きます。
2. リポジトリ名を `tape` などに設定し、**Public** を選びます。
3. このパッケージのREADMEを使うので、READMEを追加して作成すれば、このチャットのGitHub連携からソース一式を追記できます。手動で初回pushする場合は、自動追加をOFFにして空のリポジトリを作成します。

## ファイルをアップロード

ZIPを展開し、`tape` フォルダ内のファイルをリポジトリのルートに置きます。
`dist/` と `.github/` を含めてください。
MacのFinderで `.github` や `.gitignore` が見えない場合は `Command + Shift + .` で隠しファイルを表示できます。

GitHub Desktopでは、**File → Add Local Repository** から展開した `tape` を選びます。
Gitリポジトリではないと表示されたら、案内に従ってそのフォルダにリポジトリを作成します。
変更をコミットして **Publish repository** で公開します。リポジトリ名と保存先を確認し、**Keep this code private** はOFFにしてください。

ターミナルを使う場合は、展開した `tape` フォルダで次を実行します。
`<GitHubユーザー名>` と `<リポジトリ名>` を実際の値に置き換えてください。

```sh
git init
git add .
git commit -m "Publish COSMIC TAPE four-track recorder"
git branch -M main
git remote add origin https://github.com/<GitHubユーザー名>/<リポジトリ名>.git
git push -u origin main
```

GitHubの認証はGitHub Desktop、SSH、またはGit Credential Manager等で行ってください。
既存リポジトリを利用する場合は、そのリポジトリをcloneしてファイルを追加し、既存ファイルを確認してからコミットします。

## アプリのURLを公開

1. GitHubのリポジトリで **Settings → Pages** を開きます。
2. **Source** を **GitHub Actions** に設定します。
3. **Actions** タブから **Deploy COSMIC TAPE to GitHub Pages** を選び、**Run workflow** をクリックします。
4. `build` と `deploy` の両方が成功したら、**Settings → Pages** のURLを開きます。

GitHub PagesのHTTPS環境でマイク権限を許可すると録音できます。
Sourceを設定する前の初回pushでワークフローが失敗しても、設定後に **Run workflow** を実行できます。

## 更新

`dist/` のソースを編集し、`main` ブランチへpushします。ワークフローが更新内容を公開します。

## 配布内容

アプリ本体・フォント・フォントライセンス・公開設定・スクリーンショットが入っています。
個人の録音・セッションファイル、認証情報、Sites専用設定、Gitの履歴は含みません。
