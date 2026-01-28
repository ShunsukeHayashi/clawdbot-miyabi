import type {
  CommandHandler,
  CommandHandlerResult,
  HandleCommandsParams,
} from "./commands-types.js";
import { GitHubService } from "./services/github-service.js";
import { TmuxServiceLocal } from "./services/tmux-service.js";

// サービスインスタンス（シングルトン）
let githubService: GitHubService | null = null;
let tmuxService: TmuxServiceLocal | null = null;

/**
 * GitHubサービスインスタンスを取得
 * 初回呼び出し時に初期化されます
 */
function getGitHubService(): GitHubService {
  if (!githubService) {
    githubService = new GitHubService();
  }
  return githubService;
}

/**
 * tmuxサービスインスタンスを取得
 * 初回呼び出し時に初期化されます
 */
function getTmuxService(): TmuxServiceLocal {
  if (!tmuxService) {
    tmuxService = new TmuxServiceLocal();
  }
  return tmuxService;
}

/**
 * /miyabi コマンドのメインハンドラー
 */
export const handleMiyabiCommand: CommandHandler = async (params) => {
  const { command } = params;
  const commandBody = command.commandBodyNormalized;

  // /miyabi で始まらない場合は無視
  if (!commandBody.startsWith("/miyabi")) {
    return null;
  }

  // コマンドをパース
  const parts = commandBody.split(/\s+/);
  const action = parts[1]?.toLowerCase();

  // アクションが未指定の場合
  if (!action) {
    return {
      shouldContinue: false,
      reply: {
        text:
          "❌ Missing action. Use: /miyabi issue|status|agent\n\n" +
          "Examples:\n" +
          "  /miyabi issue Fix the login bug\n" +
          "  /miyabi status\n" +
          "  /miyabi agent conductor test message",
      },
    };
  }

  // アクションに応じてハンドラーにルーティング
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
          reply: {
            text: `❌ Unknown action: "${action}". Valid actions: issue, status, agent`,
          },
        };
    }
  } catch (error) {
    // 予期しないエラーをキャッチ
    console.error("Miyabi command error:", {
      action,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      shouldContinue: false,
      reply: {
        text: `❌ An error occurred while processing your command. Please try again later.`,
      },
    };
  }
};

/**
 * /miyabi issue サブコマンドハンドラー
 * GitHub Issueを作成します
 */
async function handleMiyabiIssue(
  params: HandleCommandsParams,
  args: string[],
): Promise<CommandHandlerResult> {
  const title = args.join(" ").trim();

  // タイトル未チェック
  if (!title) {
    return {
      shouldContinue: false,
      reply: {
        text:
          "❌ Missing issue title.\n\nUsage: /miyabi issue <title>\n" +
          "Example: /miyabi issue Fix authentication bug in login flow",
      },
    };
  }

  // 長さ制限チェック
  const MAX_TITLE_LENGTH = 500;
  if (title.length > MAX_TITLE_LENGTH) {
    return {
      shouldContinue: false,
      reply: {
        text: `❌ Title too long (${title.length} characters). Maximum: ${MAX_TITLE_LENGTH} characters.`,
      },
    };
  }

  try {
    const service = getGitHubService();
    const issueUrl = await service.createIssue(title);

    return {
      shouldContinue: false,
      reply: {
        text: `✅ GitHub Issue created successfully!\n\n🔗 ${issueUrl}`,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Failed to create GitHub issue:", errorMsg);

    return {
      shouldContinue: false,
      reply: {
        text: `❌ Failed to create GitHub issue.\n\nError: ${errorMsg}`,
      },
    };
  }
}

/**
 * /miyabi status サブコマンドハンドラー
 * エージェントのステータスを表示します
 */
async function handleMiyabiStatus(params: HandleCommandsParams): Promise<CommandHandlerResult> {
  try {
    const service = getTmuxService();
    const status = await service.getStatus();

    return {
      shouldContinue: false,
      reply: {
        text: status,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Failed to get miyabi status:", errorMsg);

    return {
      shouldContinue: false,
      reply: {
        text:
          `❌ Failed to get agent status.\n\nError: ${errorMsg}\n\n` +
          "Make sure the tmux session is running: tmux attach -t miyabi",
      },
    };
  }
}

/**
 * /miyabi agent サブコマンドハンドラー
 * 特定のエージェントにメッセージを送信します
 */
async function handleMiyabiAgent(
  params: HandleCommandsParams,
  args: string[],
): Promise<CommandHandlerResult> {
  const agent = args[0];
  const cmd = args.slice(1).join(" ");

  // パラメータチェック
  if (!agent) {
    return {
      shouldContinue: false,
      reply: {
        text:
          "❌ Missing agent name.\n\n" +
          "Valid agents: conductor, kaede, sakura, tsubaki, botan\n\n" +
          "Usage: /miyabi agent <name> <command>",
      },
    };
  }

  if (!cmd) {
    return {
      shouldContinue: false,
      reply: {
        text:
          "❌ Missing command.\n\nUsage: /miyabi agent <name> <command>\n" +
          "Example: /miyabi agent conductor Implement the login feature",
      },
    };
  }

  // エージェント名のバリデーション（ホワイトリスト）
  const validAgents = [
    "conductor",
    "shikirun",
    "kaede",
    "codegen",
    "sakura",
    "review",
    "tsubaki",
    "pr",
    "botan",
    "deploy",
  ];

  if (!validAgents.includes(agent.toLowerCase())) {
    return {
      shouldContinue: false,
      reply: {
        text:
          `❌ Unknown agent: "${agent}"\n\n` +
          `Valid agents: conductor, kaede, sakura, tsubaki, botan`,
      },
    };
  }

  // コマンド長さ制限
  const MAX_COMMAND_LENGTH = 1000;
  if (cmd.length > MAX_COMMAND_LENGTH) {
    return {
      shouldContinue: false,
      reply: {
        text: `❌ Command too long (${cmd.length} characters). Maximum: ${MAX_COMMAND_LENGTH} characters.`,
      },
    };
  }

  try {
    const service = getTmuxService();
    const result = await service.sendToAgent(agent, cmd);

    // メッセージを切り詰めて表示
    const displayCmd = cmd.length > 100 ? `${cmd.substring(0, 100)}...` : cmd;

    return {
      shouldContinue: false,
      reply: {
        text: `${result}\n\n\`\`\`\nAgent: ${agent}\nCommand: ${displayCmd}\n\`\`\``,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Failed to send command to agent:", errorMsg);

    return {
      shouldContinue: false,
      reply: {
        text:
          `❌ Failed to send command to ${agent}.\n\nError: ${errorMsg}\n\n` +
          "Make sure the tmux session is running: tmux attach -t miyabi",
      },
    };
  }
}
