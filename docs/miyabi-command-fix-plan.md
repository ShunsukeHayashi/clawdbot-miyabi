# /miyabi コマンド修正プラン

## 概要

Discord Botの `/miyabi` スラッシュコマンドにおける miyabi-bridge.sh への依存を排除し、Node.js 純粋実装に置き換える修正計画。

**GitHub Issue**: #7
**対象ファイル**: `src/auto-reply/reply/commands-miyabi.ts`

---

## 問題分析

### 問題1: miyabi-bridge.sh 依存

**現状:**
```typescript
const bridgeScript = `${process.env.HOME}/.claude/skills/miyabi-bridge/miyabi-bridge.sh`;
execSync(`"${bridgeScript}" issue "${title}"`, ...)
```

**問題点:**
- ECS Dockerイメージには miyabi-bridge.sh が存在しない
- リポジトリには `.claude/skills/` ディレクトリが存在しない
- 実行時エラー: `Error: spawn ENOENT`

### 問題2: コマンドインジェクション

**現状:**
```typescript
execSync(`"${bridgeScript}" issue "${title}"`, ...)
execSync(`"${bridgeScript}" agent "${agent}" "${cmd}"`, ...)
```

**脆弱性:**
- ユーザー入力（title, cmd）を直接シェルに渡している
- 特殊文字（`;`, `|`, `$`, `` ` `` 等）によるインジェクションが可能

**攻撃例:**
```
/miyabi issue "Title; rm -rf /"
/miyabi agent conductor "message; cat /etc/passwd"
```

### 問題3: 同期実行によるブロック

**現状:**
- `execSync` はプロセスが終了するまでイベントループをブロック
- Discord Botの他のリクエスト処理に影響

---

## 修正計画

### Phase 1: GitHub API 直接実装

#### 依存関係追加
```bash
npm install octokit
```

#### 実装構造
```typescript
import { Octokit } from 'octokit';

class GitHubService {
  private octokit: Octokit;

  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
  }

  async createIssue(title: string): Promise<string> {
    const result = await this.octokit.rest.issues.create({
      owner: 'ShunsukeHayashi',
      repo: 'miyabi-private',
      title: `[P1] ${this.sanitizeTitle(title)}`,
      body: this.buildIssueBody(title),
      labels: ['miyabi', 'automation']
    });
    return result.data.html_url;
  }

  private sanitizeTitle(title: string): string {
    // HTMLエスケープと長さ制限
    return title
      .replace(/[<>]/g, '')
      .substring(0, 200);
  }

  private buildIssueBody(title: string): string {
    return `## 作業宣言

### タスク概要
${this.escapeMarkdown(title)}

### 担当
- Operator: Miyabi Agent Society
- 開始時刻: ${new Date().toISOString()}

### 完了条件
- [ ] 実装完了
- [ ] テスト通過
- [ ] レビュー承認

---

*This issue was created via Discord Bot*`;
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]~`>#+=|{}.!\\-]/g, '\\$&');
  }
}
```

### Phase 2: tmux通信実装

#### Option A: SSH経由（推奨）

```typescript
import { NodeSSH } from 'node-ssh';

class TmuxService {
  private ssh: NodeSSH;

  async connect(): Promise<void> {
    this.ssh = new NodeSSH();
    await this.ssh.connect({
      host: process.env.MIYABI_HOST || 'localhost',
      username: process.env.MIYABI_USER || 'shunsukehayashi',
      port: parseInt(process.env.MIYABI_PORT || '22'),
      privateKeyPath: process.env.MIYABI_SSH_KEY || `${process.env.HOME}/.ssh/id_ed25519`
    });
  }

  async sendToAgent(agent: string, message: string): Promise<string> {
    const paneId = this.resolvePaneId(agent);
    const command = `tmux send-keys -t ${paneId} "${this.escapeTmuxString(message)}" Enter`;

    const result = await this.ssh.execCommand(command);
    if (result.stderr) {
      throw new Error(`tmux command failed: ${result.stderr}`);
    }
    return `✅ Message sent to ${agent}`;
  }

  async getStatus(): Promise<string> {
    const result = await this.ssh.execCommand('tmux list-panes -s -F "#{pane_id}: #{pane_current_command}"');
    return this.formatStatus(result.stdout);
  }

  private resolvePaneId(agent: string): string {
    const agentMap: Record<string, string> = {
      'conductor': '%27',
      'shikirun': '%27',
      'kaede': 'miyabi:codex.0',
      'sakura': 'miyabi:codex.1',
      'tsubaki': 'miyabi:codex.2',
      'botan': 'miyabi:codex.3',
    };
    return agentMap[agent.toLowerCase()] || '%27';
  }

  private escapeTmuxString(str: string): string {
    return str.replace(/"/g, '\\"').replace(/\$/g, '\\$');
  }

  private formatStatus(output: string): string {
    // tmux出力を整形
    return output.split('\n')
      .filter(line => line.trim())
      .map(line => `  ${line}`)
      .join('\n');
  }

  async disconnect(): Promise<void> {
    if (this.ssh) {
      this.ssh.dispose();
    }
  }
}
```

#### Option B: HTTP API経由（簡易版）

```typescript
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

class TmuxServiceLocal {
  async sendToAgent(agent: string, message: string): Promise<string> {
    const paneId = this.resolvePaneId(agent);
    const escapedMessage = this.escapeTmuxString(message);

    // 非同期実行に変更
    const { stdout, stderr } = await execAsync(
      `tmux send-keys -t ${paneId} "${escapedMessage}" Enter`
    );

    if (stderr) {
      throw new Error(`tmux command failed: ${stderr}`);
    }
    return `✅ Message sent to ${agent}`;
  }

  async getStatus(): Promise<string> {
    const { stdout } = await execAsync('tmux list-panes -s -F "#{pane_id}: #{pane_current_command}"');
    return this.formatStatus(stdout);
  }

  // ... 他のメソッドは Option A と同じ
}
```

### Phase 3: コマンドハンドラー書き直し

```typescript
import { Octokit } from 'octokit';
import type {
  CommandHandler,
  CommandHandlerResult,
  HandleCommandsParams,
} from "./commands-types.js";

// サービスインスタンス（シングルトン）
let githubService: GitHubService | null = null;
let tmuxService: TmuxServiceLocal | null = null;

function getGitHubService(): GitHubService {
  if (!githubService) {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }
    githubService = new GitHubService();
  }
  return githubService;
}

function getTmuxService(): TmuxServiceLocal {
  if (!tmuxService) {
    tmuxService = new TmuxServiceLocal();
  }
  return tmuxService;
}

export const handleMiyabiCommand: CommandHandler = async (params) => {
  const { command } = params;
  const commandBody = command.commandBodyNormalized;

  if (!commandBody.startsWith("/miyabi")) {
    return null;
  }

  const parts = commandBody.split(/\s+/);
  const action = parts[1]?.toLowerCase();

  if (!action) {
    return {
      shouldContinue: false,
      reply: { text: "❌ Missing action. Use: /miyabi issue|status|agent" },
    };
  }

  try {
    switch (action) {
      case "issue":
        return await handleMiyabiIssue(params, parts.slice(2));
      case "status":
        return await handleMiyabiStatus(params);
      case "agent":
        return await handleMiyabiAgent(params, parts.slice(2));
      default:
        return {
          shouldContinue: false,
          reply: { text: `❌ Unknown action: ${action}. Use: issue|status|agent` },
        };
    }
  } catch (error) {
    console.error("Miyabi command error:", error);
    return {
      shouldContinue: false,
      reply: {
        text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
};

async function handleMiyabiIssue(
  params: HandleCommandsParams,
  args: string[],
): Promise<CommandHandlerResult> {
  const title = args.join(" ").trim();

  if (!title) {
    return {
      shouldContinue: false,
      reply: { text: "❌ Missing issue title. Use: /miyabi issue <title>" },
    };
  }

  // 長さ制限チェック
  if (title.length > 500) {
    return {
      shouldContinue: false,
      reply: { text: "❌ Title too long (max 500 characters)" },
    };
  }

  try {
    const service = getGitHubService();
    const issueUrl = await service.createIssue(title);

    return {
      shouldContinue: false,
      reply: {
        text: `✅ GitHub Issue created: ${issueUrl}`,
      },
    };
  } catch (error) {
    return {
      shouldContinue: false,
      reply: {
        text: `❌ Failed to create issue: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

async function handleMiyabiStatus(
  params: HandleCommandsParams,
): Promise<CommandHandlerResult> {
  try {
    const service = getTmuxService();
    const status = await service.getStatus();

    return {
      shouldContinue: false,
      reply: {
        text: `📊 Miyabi Agent Status:\n\`\`\`\n${status}\n\`\`\``,
      },
    };
  } catch (error) {
    return {
      shouldContinue: false,
      reply: {
        text: `❌ Failed to get status: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

async function handleMiyabiAgent(
  params: HandleCommandsParams,
  args: string[],
): Promise<CommandHandlerResult> {
  const agent = args[0];
  const cmd = args.slice(1).join(" ");

  if (!agent || !cmd) {
    return {
      shouldContinue: false,
      reply: {
        text: "❌ Missing agent or command. Use: /miyabi agent <name> <command>",
      },
    };
  }

  // エージェント名のバリデーション
  const validAgents = ['conductor', 'shikirun', 'kaede', 'sakura', 'tsubaki', 'botan'];
  if (!validAgents.includes(agent.toLowerCase())) {
    return {
      shouldContinue: false,
      reply: {
        text: `❌ Unknown agent: ${agent}. Valid agents: ${validAgents.join(', ')}`,
      },
    };
  }

  // コマンド長さ制限
  if (cmd.length > 1000) {
    return {
      shouldContinue: false,
      reply: { text: "❌ Command too long (max 1000 characters)" },
    };
  }

  try {
    const service = getTmuxService();
    const result = await service.sendToAgent(agent, cmd);

    return {
      shouldContinue: false,
      reply: {
        text: `${result}\n\`\`\`\nAgent: ${agent}\nMessage: ${cmd.substring(0, 100)}${cmd.length > 100 ? '...' : ''}\n\`\`\``,
      },
    };
  } catch (error) {
    return {
      shouldContinue: false,
      reply: {
        text: `❌ Failed to send command: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}
```

---

## 依存関係

### 追加パッケージ

```bash
# GitHub API (必須)
npm install octokit

# SSH通信 (Option Aの場合)
npm install node-ssh
```

### 環境変数

```bash
# GitHub API (必須)
GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# SSH通信 (Option Aの場合)
MIYABI_HOST=localhost
MIYABI_USER=shunsukehayashi
MIYABI_PORT=22
MIYABI_SSH_KEY=/home/node/.ssh/id_ed25519
```

---

## セキュリティ対策

### 1. 入力バリデーション

| パラメータ | チェック内容 | 制限 |
|-----------|-------------|------|
| title | 長さ、文字種 | 最大500文字 |
| agent | ホワイトリスト | 6種類のみ |
| cmd | 長さ | 最大1000文字 |

### 2. エスケープ処理

| コンテキスト | 対策 |
|------------|------|
| GitHub API | Markdown特殊文字エスケープ |
| tmux | 二重引用符エスケープ、ドル記号エスケープ |

### 3. エラーハンドリング

- ユーザー入力をエラーメッセージに直接含めない
- エラーログには詳細情報を出力
- ユーザーには一般的なエラーメッセージのみ表示

---

## テスト計画

### 単体テスト

```typescript
// GitHubService.test.ts
describe('GitHubService', () => {
  it('should create issue successfully', async () => {
    const service = new GitHubService();
    const url = await service.createIssue('Test issue');
    expect(url).toMatch(/https:\/\/github\.com\/.*/);
  });

  it('should sanitize malicious input', async () => {
    const service = new GitHubService();
    const sanitized = service['sanitizeTitle']('Test; rm -rf /');
    expect(sanitized).not.toContain(';');
  });
});

// TmuxService.test.ts
describe('TmuxServiceLocal', () => {
  it('should send message to agent', async () => {
    const service = new TmuxServiceLocal();
    const result = await service.sendToAgent('conductor', 'test message');
    expect(result).toContain('✅');
  });

  it('should validate agent names', async () => {
    const service = new TmuxServiceLocal();
    await expect(
      service.sendToAgent('invalid-agent', 'test')
    ).rejects.toThrow();
  });
});
```

### E2Eテスト

```bash
# Discord Botテスト
/miyabi status
# → Agent status表示

/miyabi issue "Test issue from Discord"
# → GitHub Issue作成、URL返信

/miyabi agent conductor "test message"
# → tmuxにメッセージ送信
```

---

## 実装スケジュール

| Phase | タスク | 見積時間 |
|-------|-------|---------|
| 1 | octokitインストール | 5分 |
| 2 | GitHubService実装 | 30分 |
| 3 | TmuxServiceLocal実装 | 30分 |
| 4 | コマンドハンドラー書き直し | 30分 |
| 5 | 単体テスト作成 | 30分 |
| 6 | レビュー・修正 | 30分 |
| 7 | E2Eテスト | 15分 |
| 8 | デプロイ | 20分 |

**合計**: 約3時間

---

## ロールバック計画

問題が発生した場合、以下の手順でロールバック：

1. Git で以前のコミットに戻す
2. Dockerイメージを再ビルド
3. ECS にデプロイ

```bash
git revert HEAD
docker build -t clawdbot .
docker tag clawdbot:latest 432500874071.dkr.ecr.ap-northeast-1.amazonaws.com/clawdbot/bot:latest
docker push 432500874071.dkr.ecr.ap-northeast-1.amazonaws.com/clawdbot/bot:latest
aws ecs update-service --cluster clawdbot-cluster --service clawdbot-service --force-new-deployment
```

---

## 参考資料

- [Octokit Documentation](https://github.com/octokit/octokit.js)
- [tmux Manual](https://github.com/tmux/tmux/wiki)
- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
