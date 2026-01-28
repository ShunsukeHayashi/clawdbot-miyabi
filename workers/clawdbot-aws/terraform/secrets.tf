/**
 * AWS Secrets Manager Data Sources
 */

# Discord Bot Token from Secrets Manager
data "aws_secretsmanager_secret_version" "discord_token" {
  secret_id = var.discord_token_secret_name
}

# Clawdbot Config from Secrets Manager
data "aws_secretsmanager_secret" "clawdbot_config" {
  name = "clawdbot/config"
}
